import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/pickers/data/picker_repository.dart';
import 'package:pikva/features/pickers/domain/person_draft.dart';
import 'package:pikva/features/pickers/domain/pickup_person.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

void main() {
  final now = DateTime(2026, 11, 12, 10, 0);

  PersonDraft valid({
    int? pupilId = 1,
    String name = 'Grace Okafor',
    String phone = '08011112222',
    String relationship = 'Aunt',
    String type = 'Regular',
    DateTime? startsAt,
    DateTime? expiresAt,
  }) => PersonDraft(
    pupilId: pupilId,
    name: name,
    phone: phone,
    relationship: relationship,
    type: type,
    startsAt: startsAt ?? DateTime(2026, 11, 12, 10, 0),
    expiresAt: expiresAt ?? DateTime(2027, 11, 12, 10, 0),
  );

  group('PersonDraft.validate (new person)', () {
    test('builds the full body with UTC times and trimmed text', () {
      final r = valid(name: '  Grace Okafor ').validate(now: now);
      expect(r.isOk, isTrue);
      final b = r.body!;
      expect(b['pupil_id'], 1);
      expect(b['picker_name'], 'Grace Okafor');
      expect(b['picker_phone'], '08011112222');
      expect(b['relationship'], 'Aunt');
      expect(b['type'], 'Regular');
      expect(
        DateTime.parse(b['starts_at'] as String),
        DateTime(2026, 11, 12, 10, 0).toUtc(),
      );
      expect((b['expires_at'] as String).endsWith('Z'), isTrue);
    });

    final cases = <String, (PersonDraft, String)>{
      'no pupil': (
        valid(pupilId: null),
        'Choose the pupil this person may collect.',
      ),
      'no name': (valid(name: '  '), "Enter the pickup person's name."),
      'long name': (
        valid(name: 'x' * 151),
        'The name can be at most 150 characters.',
      ),
      'no phone': (valid(phone: ''), "Enter the pickup person's phone number."),
      'long phone': (
        valid(phone: '1' * 31),
        'The phone number can be at most 30 characters.',
      ),
      'no relationship': (
        valid(relationship: ''),
        'Enter how this person is related to the pupil.',
      ),
      'no type': (valid(type: ' '), 'Enter the type of authorisation.'),
      'long type': (
        valid(type: 'x' * 51),
        'Relationship and type can be at most 50 characters.',
      ),
      'end before start': (
        valid(expiresAt: DateTime(2026, 11, 12, 9, 0)),
        'The end time must be after the start time.',
      ),
      'end already passed': (
        valid(
          startsAt: DateTime(2026, 11, 1),
          expiresAt: DateTime(2026, 11, 2),
        ),
        'The end time has already passed.',
      ),
    };
    for (final e in cases.entries) {
      test('rejects: ${e.key}', () {
        final r = e.value.$1.validate(now: now);
        expect(r.isOk, isFalse);
        expect(r.error, e.value.$2);
      });
    }

    test('requires both times', () {
      const empty = PersonDraft(
        pupilId: 1,
        name: 'A',
        phone: '1',
        relationship: 'r',
      );
      expect(
        empty.validate(now: now).error,
        'Choose when this person may start collecting.',
      );
      expect(
        empty.copyWith(startsAt: now).validate(now: now).error,
        'Choose when this authorisation ends.',
      );
    });
  });

  group('PersonDraft.validate (edit)', () {
    final original = PickupPerson.fromJson(pickerJson());

    test('an untouched form sends nothing', () {
      final r = PersonDraft.from(original)
          .validate(now: now, original: original);
      expect(r.isOk, isTrue);
      expect(r.body, isEmpty);
    });

    test('only changed fields are sent', () {
      final r = PersonDraft.from(original)
          .copyWith(name: 'Grace Obi', type: 'Temporary')
          .validate(now: now, original: original);
      expect(r.body, {'picker_name': 'Grace Obi', 'type': 'Temporary'});
    });

    test('padding around unchanged text is not a change', () {
      final r = PersonDraft.from(original)
          .copyWith(name: '  Grace Okafor  ')
          .validate(now: now, original: original);
      expect(r.body, isEmpty);
    });

    test('a changed end time is sent as UTC', () {
      final draft = PersonDraft.from(original);
      final r = draft
          .copyWith(expiresAt: draft.expiresAt!.add(const Duration(days: 1)))
          .validate(now: now, original: original);
      expect(r.body!.keys, ['expires_at']);
      expect((r.body!['expires_at'] as String).endsWith('Z'), isTrue);
    });

    test('a past end time is allowed when editing (as on the web)', () {
      final r = PersonDraft.from(original)
          .copyWith(name: 'New')
          .validate(now: DateTime(2030), original: original);
      expect(r.isOk, isTrue);
    });
  });

  group('PickerRepository create and update', () {
    test('create posts the body', () async {
      final backend = FakeBackend({
        'POST /pickers': (201, pickerJson(id: 20, status: 'pending_approval')),
      });
      final p = await PickerRepository(apiFor(backend)).create({'pupil_id': 1});
      expect(p.id, 20);
      expect(backend.bodies['POST /pickers'], {'pupil_id': 1});
    });

    test('update patches only the changes', () async {
      final backend = FakeBackend({
        'PATCH /pickers/10': (200, pickerJson(name: 'Grace Obi')),
      });
      final p = await PickerRepository(apiFor(backend))
          .update(10, {'picker_name': 'Grace Obi'});
      expect(p.name, 'Grace Obi');
      expect(backend.bodies['PATCH /pickers/10'], {'picker_name': 'Grace Obi'});
    });
  });

  group('form screens', () {
    Future<void> openPeople(WidgetTester tester, dynamic a) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pickup people').last);
      await tester.pumpAndSettle();
    }

    Future<void> type(WidgetTester tester, String label, String text) =>
        tester.enterText(find.widgetWithText(TextField, label), text);

    Future<void> pickEndDate(WidgetTester tester) async {
      await tester.tap(find.widgetWithText(InkWell, 'Until'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    }

    testWidgets('adds a person and shows them awaiting approval', (
      tester,
    ) async {
      final a = parentApp({
        'GET /pickers': (200, []),
        'POST /pickers': (
          201,
          pickerJson(
            id: 20,
            pupilId: 2,
            name: 'Tunde Bello',
            status: 'pending_approval',
          ),
        ),
      });
      await openPeople(tester, a);

      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();
      expect(find.text('Add pickup person'), findsOneWidget);

      await tester.tap(find.text('Pupil'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Amaka Eze').last);
      await tester.pumpAndSettle();
      await type(tester, 'Full name', 'Tunde Bello');
      await type(tester, 'Phone number', '08033334444');
      await type(tester, 'Relationship to pupil', 'Driver');
      await tester.tap(find.widgetWithText(ActionChip, 'Temporary'));
      await pickEndDate(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Add person'));
      await tester.pumpAndSettle();

      final body = a.backend.bodies['POST /pickers'] as Map;
      expect(body['pupil_id'], 2);
      expect(body['picker_name'], 'Tunde Bello');
      expect(body['picker_phone'], '08033334444');
      expect(body['relationship'], 'Driver');
      expect(body['type'], 'Temporary');

      expect(find.text('Add pickup person'), findsNothing);
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(find.text('Awaiting approval'), findsOneWidget);
      expect(find.textContaining('Your school will approve'), findsOneWidget);
    });

    testWidgets('shows the first problem and sends nothing', (tester) async {
      final a = parentApp({'GET /pickers': (200, [])});
      await openPeople(tester, a);

      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Add person'));
      await tester.pumpAndSettle();

      expect(
        find.text('Choose the pupil this person may collect.'),
        findsOneWidget,
      );
      expect(a.backend.count('POST /pickers'), 0);
    });

    testWidgets('a refused add shows the backend message and stays open', (
      tester,
    ) async {
      final a = parentApp({
        'GET /pickers': (200, []),
        'POST /pickers': (
          422,
          {'detail': 'Expiry time must be after start time'},
        ),
      });
      await openPeople(tester, a);

      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pupil'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chidi Eze').last);
      await tester.pumpAndSettle();
      await type(tester, 'Full name', 'Tunde Bello');
      await type(tester, 'Phone number', '08033334444');
      await type(tester, 'Relationship to pupil', 'Driver');
      await pickEndDate(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Add person'));
      await tester.pumpAndSettle();

      expect(find.text('Expiry time must be after start time'), findsOneWidget);
      expect(find.text('Add pickup person'), findsOneWidget);
    });

    testWidgets('edits only what changed and warns about re-approval', (
      tester,
    ) async {
      final a = parentApp({
        'GET /pickers': (200, [pickerJson()]),
        'PATCH /pickers/10': (
          200,
          pickerJson(name: 'Grace Obi', status: 'pending_approval'),
        ),
      });
      await openPeople(tester, a);

      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      expect(find.text('Edit pickup person'), findsOneWidget);
      expect(
        find.textContaining('cannot collect until your school'),
        findsOneWidget,
      );
      // The pupil cannot be changed on an existing person.
      expect(find.text('Pupil'), findsNothing);

      await type(tester, 'Full name', 'Grace Obi');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(a.backend.bodies['PATCH /pickers/10'], {
        'picker_name': 'Grace Obi',
      });
      expect(find.text('Grace Obi'), findsOneWidget);
      expect(find.text('Awaiting approval'), findsOneWidget);
      expect(find.text('Saved changes to Grace Obi.'), findsOneWidget);
    });

    testWidgets('saving without changes sends nothing', (tester) async {
      final a = parentApp({
        'GET /pickers': (200, [pickerJson()]),
      });
      await openPeople(tester, a);

      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(a.backend.count('PATCH /pickers/10'), 0);
      expect(find.text('Edit pickup person'), findsNothing);
    });
  });
}
