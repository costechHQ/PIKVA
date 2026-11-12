import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/repositories.dart';
import 'package:pikva/features/auth/data/auth_repository.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/presentation/auth_controller.dart';
import 'package:pikva/features/pickers/data/picker_repository.dart';
import 'package:pikva/features/pickers/domain/pickup_person.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

const _me = {
  'id': 7,
  'school_id': 1,
  'name': 'Ada Eze',
  'email': 'a@example.com',
  'phone': '08000000000',
  'role': 'parent',
  'school_name': 'Sunrise School',
};

void main() {
  group('PickupPerson', () {
    test('parses the API response', () {
      final p = PickupPerson.fromJson(pickerJson());
      expect(p.name, 'Grace Okafor');
      expect(p.initials, 'GO');
      expect(p.status, PersonStatus.active);
      expect(p.hasPhoto, isFalse);
    });

    test('maps every status and treats unknown ones as inactive', () {
      expect(
        PersonStatus.parse('pending_approval'),
        PersonStatus.pendingApproval,
      );
      expect(PersonStatus.parse('scheduled'), PersonStatus.scheduled);
      expect(PersonStatus.parse('expired'), PersonStatus.expired);
      expect(PersonStatus.parse('inactive'), PersonStatus.inactive);
      expect(PersonStatus.parse('something_new'), PersonStatus.inactive);
    });

    test('initials handle one-word and padded names', () {
      expect(PickupPerson.fromJson(pickerJson(name: 'Madonna')).initials, 'M');
      expect(
        PickupPerson.fromJson(pickerJson(name: '  ada  obi ')).initials,
        'AO',
      );
    });
  });

  group('PickerRepository', () {
    test('list returns the people', () async {
      final backend = FakeBackend({
        'GET /pickers': (
          200,
          [pickerJson(), pickerJson(id: 11, name: 'Tunde')],
        ),
      });
      final list = await PickerRepository(apiFor(backend)).list();
      expect(list.map((p) => p.name), ['Grace Okafor', 'Tunde']);
    });

    test('setActive calls the right endpoint and returns the update', () async {
      final backend = FakeBackend({
        'POST /pickers/10/deactivate': (
          200,
          pickerJson(isActive: false, status: 'inactive'),
        ),
        'POST /pickers/10/activate': (200, pickerJson()),
      });
      final repo = PickerRepository(apiFor(backend));

      final off = await repo.setActive(10, active: false);
      expect(off.isActive, isFalse);
      expect(off.status, PersonStatus.inactive);

      final on = await repo.setActive(10, active: true);
      expect(on.isActive, isTrue);
    });

    test('photos are cached until cleared', () async {
      final backend = FakeBackend({
        'GET /pickers/10/photo': (200, Uint8List.fromList([1, 2])),
      });
      final repo = PickerRepository(apiFor(backend));
      final person = PickupPerson.fromJson(
        pickerJson(photoUpdatedAt: '2026-11-02T10:00:00Z'),
      );

      await repo.photo(person);
      await repo.photo(person);
      expect(backend.count('GET /pickers/10/photo'), 1);

      repo.clearCache();
      await repo.photo(person);
      expect(backend.count('GET /pickers/10/photo'), 2);
    });
  });

  group('pickup people screen', () {
    ({FakeBackend backend, AuthController auth, Repositories repos}) app(
      Map<String, (int, Object)> routes,
    ) {
      final backend = FakeBackend({
        'GET /auth/me': (200, _me),
        'GET /pupils': (200, [pupilJson(), pupilJson(id: 2, first: 'Amaka')]),
        ...routes,
      });
      final tokens = MemoryTokenStore()..write('t');
      final api = apiFor(backend, token: tokens.read);
      return (
        backend: backend,
        auth: AuthController(AuthRepository(api: api, tokens: tokens)),
        repos: Repositories.from(api),
      );
    }

    Future<void> openTab(WidgetTester tester) async {
      await tester.tap(find.text('Pickup people').last);
      await tester.pumpAndSettle();
    }

    testWidgets('groups people under each child', (tester) async {
      // Tall enough that the second child's section is built too.
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = app({
        'GET /pickers': (
          200,
          [
            pickerJson(),
            pickerJson(
              id: 11,
              name: 'Tunde Bello',
              status: 'pending_approval',
              isActive: true,
            ),
          ],
        ),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await openTab(tester);

      expect(find.text('Chidi Eze'), findsOneWidget);
      expect(find.text('Amaka Eze'), findsOneWidget);
      expect(find.text('Grace Okafor'), findsOneWidget);
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(find.text('Active'), findsOneWidget);
      expect(find.text('Awaiting approval'), findsOneWidget);
      expect(find.textContaining('Waiting for your school'), findsOneWidget);
      expect(find.text('No pickup people for Amaka yet.'), findsOneWidget);
    });

    testWidgets('deactivating asks first, then updates the card', (
      tester,
    ) async {
      final a = app({
        'GET /pickers': (200, [pickerJson()]),
        'POST /pickers/10/deactivate': (
          200,
          pickerJson(isActive: false, status: 'inactive'),
        ),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await openTab(tester);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();
      expect(find.text('Deactivate Grace Okafor?'), findsOneWidget);

      // Cancel does nothing.
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(a.backend.count('POST /pickers/10/deactivate'), 0);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Deactivate'));
      await tester.pumpAndSettle();

      expect(a.backend.count('POST /pickers/10/deactivate'), 1);
      expect(find.text('Inactive'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Activate'), findsOneWidget);
    });

    testWidgets('activating updates the card', (tester) async {
      final a = app({
        'GET /pickers': (
          200,
          [pickerJson(isActive: false, status: 'inactive')],
        ),
        'POST /pickers/10/activate': (200, pickerJson()),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await openTab(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Activate'));
      await tester.pumpAndSettle();

      expect(find.text('Active'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Deactivate'), findsOneWidget);
    });

    testWidgets('a failed change shows the message and keeps the state', (
      tester,
    ) async {
      final a = app({
        'GET /pickers': (
          200,
          [pickerJson(isActive: false, status: 'inactive')],
        ),
        'POST /pickers/10/activate': (
          409,
          {'detail': 'This person has expired'},
        ),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await openTab(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Activate'));
      await tester.pumpAndSettle();

      expect(find.text('This person has expired'), findsOneWidget);
      expect(find.text('Inactive'), findsOneWidget);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final a = app({
        'GET /pickers': (500, {'detail': 'boom'}),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await openTab(tester);

      expect(find.text('Try again'), findsOneWidget);

      a.backend.routes['GET /pickers'] = (200, [pickerJson()]);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Grace Okafor'), findsOneWidget);
    });

    testWidgets('the bottom bar switches between the two tabs', (tester) async {
      final a = app({'GET /pickers': (200, [])});
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      expect(find.text('My children'), findsOneWidget);

      await openTab(tester);
      expect(find.text('My children'), findsNothing);

      await tester.tap(find.text('Children'));
      await tester.pumpAndSettle();
      expect(find.text('My children'), findsOneWidget);
    });
  });
}
