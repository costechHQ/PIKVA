import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/approvals/domain/approval_request.dart';
import 'package:pikva/features/pickers/data/picker_repository.dart';
import 'package:pikva/features/pickers/domain/pickup_person.dart';
import 'package:pikva/features/pupils/domain/pupil.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

PickupPerson person({
  int id = 10,
  int pupilId = 1,
  String name = 'Grace Okafor',
  String status = 'pending_approval',
  String updatedAt = '2026-11-01T07:00:00Z',
}) => PickupPerson.fromJson(
  pickerJson(
    id: id,
    pupilId: pupilId,
    name: name,
    status: status,
    updatedAt: updatedAt,
  ),
);

void main() {
  group('model additions', () {
    test('a pupil carries the parent contact details', () {
      final p = Pupil.fromJson(pupilJson());
      expect(p.parent!.name, 'Ada Eze');
      expect(p.parent!.phone, '08000000000');
      expect(p.parent!.email, 'a@example.com');
    });

    test('a pupil without a parent still parses', () {
      final json = pupilJson()..remove('parent');
      expect(Pupil.fromJson(json).parent, isNull);
    });

    test('updated_at is kept exactly as the server sent it', () {
      final p = person(updatedAt: '2026-11-01T07:00:00.123456+00:00');
      expect(p.updatedAtRaw, '2026-11-01T07:00:00.123456+00:00');
    });
  });

  group('pendingApprovals', () {
    final pupils = [
      Pupil.fromJson(pupilJson()),
      Pupil.fromJson(pupilJson(id: 2, first: 'Amaka')),
    ];

    test('keeps only people awaiting approval', () {
      final result = pendingApprovals([
        person(id: 1),
        person(id: 2, status: 'active'),
        person(id: 3, status: 'inactive'),
        person(id: 4, status: 'expired'),
      ], pupils);
      expect(result.map((r) => r.person.id), [1]);
    });

    test('longest-waiting first, ties by id', () {
      final result = pendingApprovals([
        person(id: 5, updatedAt: '2026-11-03T07:00:00Z'),
        person(id: 7, updatedAt: '2026-11-01T07:00:00Z'),
        person(id: 6, updatedAt: '2026-11-01T07:00:00Z'),
      ], pupils);
      expect(result.map((r) => r.person.id), [6, 7, 5]);
    });

    test('pairs each with its pupil, or null if not found', () {
      final result = pendingApprovals([
        person(id: 1, pupilId: 2),
        person(id: 2, pupilId: 99),
      ], pupils);
      expect(result[0].pupil!.firstName, 'Amaka');
      expect(result[1].pupil, isNull);
    });
  });

  group('PickerRepository.approve', () {
    test('sends back the updated_at the admin saw, unchanged', () async {
      final backend = FakeBackend({
        'POST /pickers/10/approve': (200, pickerJson(status: 'active')),
      });
      final saw = person(updatedAt: '2026-11-01T07:00:00.123456+00:00');
      final result = await PickerRepository(apiFor(backend)).approve(saw);

      expect(backend.bodies['POST /pickers/10/approve'], {
        'updated_at': '2026-11-01T07:00:00.123456+00:00',
      });
      expect(result.status, PersonStatus.active);
    });
  });

  group('approvals screen', () {
    Future<({FakeBackend backend})> openApprovals(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp({
        'GET /pickers': (200, []),
        'GET /releases': (200, []),
        'GET /alerts': (200, []),
        ...routes,
      }, role: 'school_admin');
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Approvals'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    final waiting = [
      pickerJson(name: 'Grace Okafor', status: 'pending_approval'),
      pickerJson(
        id: 11,
        pupilId: 2,
        name: 'Tunde Bello',
        status: 'pending_approval',
        updatedAt: '2026-11-02T07:00:00Z',
      ),
      pickerJson(id: 12, name: 'Already Active'),
    ];

    testWidgets('lists the requests with the pupil and the parent', (
      tester,
    ) async {
      await openApprovals(tester, {'GET /pickers': (200, waiting)});

      expect(find.text('Grace Okafor'), findsOneWidget);
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(find.text('Already Active'), findsNothing);
      expect(find.textContaining('Would collect'), findsNWidgets(2));
      expect(find.text('Would collect Chidi Eze'), findsOneWidget);
      expect(find.text('Would collect Amaka Eze'), findsOneWidget);
      expect(find.textContaining('Sent by Ada Eze'), findsWidgets);
      expect(find.text('08000000000'), findsWidgets);
      expect(find.text('a@example.com'), findsWidgets);
      expect(find.text('Approve'), findsNWidgets(2));
      // Longest-waiting first.
      expect(
        tester.getTopLeft(find.text('Grace Okafor')).dy,
        lessThan(tester.getTopLeft(find.text('Tunde Bello')).dy),
      );
    });

    testWidgets('approving sends what was seen and removes the request', (
      tester,
    ) async {
      final g = await openApprovals(tester, {
        'GET /pickers': (200, waiting),
        'POST /pickers/10/approve': (200, pickerJson(status: 'active')),
      });

      await tester.tap(find.widgetWithText(FilledButton, 'Approve').first);
      await tester.pumpAndSettle();

      expect(g.backend.bodies['POST /pickers/10/approve'], {
        'updated_at': '2026-11-01T07:00:00Z',
      });
      expect(find.text('Grace Okafor'), findsNothing);
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(
        find.text('Grace Okafor approved. They can now collect Chidi Eze.'),
        findsOneWidget,
      );
    });

    testWidgets('declining asks first, then deactivates', (tester) async {
      final g = await openApprovals(tester, {
        'GET /pickers': (200, waiting),
        'POST /pickers/10/deactivate': (
          200,
          pickerJson(isActive: false, status: 'inactive'),
        ),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Decline').first);
      await tester.pumpAndSettle();
      expect(find.textContaining('Decline Grace Okafor?'), findsOneWidget);
      expect(g.backend.count('POST /pickers/10/deactivate'), 0);

      // Backing out changes nothing.
      await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Approve'), findsNWidgets(2));

      await tester.tap(find.widgetWithText(OutlinedButton, 'Decline').first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Decline'));
      await tester.pumpAndSettle();

      expect(g.backend.count('POST /pickers/10/deactivate'), 1);
      expect(g.backend.count('POST /pickers/10/approve'), 0);
      expect(find.text('Grace Okafor'), findsNothing);
      expect(
        find.text('Grace Okafor declined and deactivated.'),
        findsOneWidget,
      );
    });

    testWidgets('a change the admin has not seen is refused, not approved', (
      tester,
    ) async {
      await openApprovals(tester, {
        'GET /pickers': (200, waiting),
        'POST /pickers/10/approve': (
          409,
          {'detail': 'Details changed since you reviewed them'},
        ),
      });

      await tester.tap(find.widgetWithText(FilledButton, 'Approve').first);
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Details changed since you reviewed them'),
        findsOneWidget,
      );
      expect(find.textContaining('pull down to refresh'), findsOneWidget);
      // Still waiting; nothing was approved.
      expect(find.text('Grace Okafor'), findsOneWidget);
      expect(find.text('Approve'), findsNWidgets(2));
    });

    testWidgets('nothing waiting reads as empty', (tester) async {
      await openApprovals(tester, {
        'GET /pickers': (200, [pickerJson(id: 12, name: 'Already Active')]),
      });

      expect(
        find.textContaining('Nothing waiting for approval'),
        findsOneWidget,
      );
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final g = await openApprovals(tester, {
        'GET /pickers': (500, {'detail': 'boom'}),
      });
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /pickers'] = (200, waiting);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Grace Okafor'), findsOneWidget);
    });

    testWidgets('the dashboard banner leads here', (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp({
        'GET /pickers': (200, waiting),
        'GET /releases': (200, []),
        'GET /alerts': (200, []),
      }, role: 'school_admin');
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('2 pickup people are waiting for approval'),
        findsOneWidget,
      );
      await tester.tap(find.text('Review approvals'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Would collect'), findsNWidgets(2));
    });
  });
}
