import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/people/domain/person_rows.dart';
import 'package:pikva/features/pickers/domain/pickup_person.dart';
import 'package:pikva/features/pupils/domain/pupil.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

PickupPerson person({
  int id = 10,
  int pupilId = 1,
  String name = 'Grace Okafor',
  String status = 'active',
  bool isActive = true,
  String phone = '08011112222',
}) => PickupPerson.fromJson(
  pickerJson(
    id: id,
    pupilId: pupilId,
    name: name,
    status: status,
    isActive: isActive,
    phone: phone,
  ),
);

void main() {
  final pupils = [
    Pupil.fromJson(pupilJson()),
    Pupil.fromJson(pupilJson(id: 2, first: 'Amaka', last: 'Obi')),
  ];

  group('personRows', () {
    test('pairs each person with their pupil, or null', () {
      final rows = personRows([
        person(pupilId: 2),
        person(id: 11, pupilId: 99),
      ], pupils);
      expect(
        rows.firstWhere((r) => r.person.id == 10).pupil!.firstName,
        'Amaka',
      );
      expect(rows.firstWhere((r) => r.person.id == 11).pupil, isNull);
    });

    test('sorts by name ignoring case and accents, then pupil, then id', () {
      final rows = personRows([
        person(id: 3, name: 'zara'),
        person(id: 2, name: 'Ángel'),
        person(id: 1, name: 'angel'),
        person(id: 4, name: 'Bola'),
      ], pupils);
      // "Ángel" and "angel" tie on name, so the pupil, then the id, decide.
      expect(rows.map((r) => r.person.id), [1, 2, 4, 3]);
    });
  });

  group('filterPersonRows', () {
    final rows = personRows([
      person(id: 1, name: 'Grace Okafor', phone: '0801'),
      person(
        id: 2,
        name: 'Tunde Bello',
        status: 'pending_approval',
        phone: '0802',
        pupilId: 2,
      ),
      person(id: 3, name: 'Old Person', status: 'expired', phone: '0803'),
      person(
        id: 4,
        name: 'Off Person',
        status: 'inactive',
        isActive: false,
        phone: '0804',
      ),
    ], pupils);

    List<int> ids(StatusFilter f, [String q = '']) =>
        filterPersonRows(rows, f, q).map((r) => r.person.id).toList()..sort();

    test('by status', () {
      expect(ids(StatusFilter.all), [1, 2, 3, 4]);
      expect(ids(StatusFilter.values[1]), [1]); // Active
      expect(ids(StatusFilter.values[2]), [2]); // Awaiting approval
      expect(ids(StatusFilter.values[4]), [3]); // Expired
      expect(ids(StatusFilter.values[5]), [4]); // Inactive
      expect(ids(StatusFilter.values[3]), isEmpty); // Scheduled
    });

    test('by name, phone or pupil, every word', () {
      expect(ids(StatusFilter.all, 'tunde'), [2]);
      expect(ids(StatusFilter.all, '0803'), [3]);
      expect(ids(StatusFilter.all, 'amaka'), [2]); // pupil's name
      expect(ids(StatusFilter.all, 'person old'), [3]);
      expect(ids(StatusFilter.all, 'person zzz'), isEmpty);
    });

    test('status and search combine', () {
      expect(ids(StatusFilter.values[1], 'tunde'), isEmpty);
      expect(ids(StatusFilter.values[2], 'tunde'), [2]);
    });

    test('filters read in the web order with the web labels', () {
      expect(StatusFilter.values.map((f) => f.label), [
        'All',
        'Active',
        'Awaiting approval',
        'Scheduled',
        'Expired',
        'Inactive',
      ]);
    });

    test('counts per status', () {
      final counts = statusCounts(rows);
      expect(counts[PersonStatus.active], 1);
      expect(counts[PersonStatus.pendingApproval], 1);
      expect(counts[PersonStatus.scheduled], isNull);
    });
  });

  group('admin people screen', () {
    Future<({FakeBackend backend})> openPeople(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3500);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp({
        'GET /releases': (200, []),
        'GET /alerts': (200, []),
        ...routes,
      }, role: 'school_admin');
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'More'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pickup people'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    Future<void> type(WidgetTester tester, String label, String text) =>
        tester.enterText(find.widgetWithText(TextField, label), text);

    final all = [
      pickerJson(name: 'Grace Okafor'),
      pickerJson(
        id: 11,
        pupilId: 2,
        name: 'Tunde Bello',
        status: 'pending_approval',
        phone: '08022223333',
      ),
      pickerJson(
        id: 12,
        name: 'Off Person',
        status: 'inactive',
        isActive: false,
      ),
    ];

    testWidgets('lists everyone with status counts and details', (
      tester,
    ) async {
      await openPeople(tester, {'GET /pickers': (200, all)});

      expect(find.text('All (3)'), findsOneWidget);
      expect(find.text('Active (1)'), findsOneWidget);
      expect(find.text('Awaiting approval (1)'), findsOneWidget);
      expect(find.text('Scheduled (0)'), findsOneWidget);
      expect(find.text('Inactive (1)'), findsOneWidget);

      expect(find.text('Grace Okafor'), findsOneWidget);
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(find.text('Chidi Eze'), findsWidgets);
      expect(find.text('Amaka Eze'), findsOneWidget);
      expect(find.text('08022223333'), findsOneWidget);
      expect(find.text('Aunt · permanent'), findsWidgets);
    });

    testWidgets('a status filter and search narrow the list', (tester) async {
      await openPeople(tester, {'GET /pickers': (200, all)});

      await tester.tap(find.text('Awaiting approval (1)'));
      await tester.pumpAndSettle();
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(find.text('Grace Okafor'), findsNothing);

      await tester.tap(find.text('All (3)'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, '0802');
      await tester.pumpAndSettle();
      expect(find.text('Tunde Bello'), findsOneWidget);
      expect(find.text('Grace Okafor'), findsNothing);

      await tester.enterText(find.byType(TextField).first, 'nobody');
      await tester.pumpAndSettle();
      expect(find.text('No pickup people match this filter.'), findsOneWidget);

      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('Grace Okafor'), findsOneWidget);
    });

    testWidgets('no pickup people at all explains where they come from', (
      tester,
    ) async {
      await openPeople(tester, {'GET /pickers': (200, [])});

      expect(find.textContaining('Parents add them'), findsOneWidget);
    });

    testWidgets('deactivating asks first, and names the pupil', (tester) async {
      final g = await openPeople(tester, {
        'GET /pickers': (200, [pickerJson()]),
        'POST /pickers/10/deactivate': (
          200,
          pickerJson(isActive: false, status: 'inactive'),
        ),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          'Deactivate Grace Okafor? They cannot collect Chidi Eze, even with a code already issued.',
        ),
        findsOneWidget,
      );
      expect(g.backend.count('POST /pickers/10/deactivate'), 0);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Deactivate Grace Okafor?'), findsNothing);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Deactivate'));
      await tester.pumpAndSettle();

      expect(g.backend.count('POST /pickers/10/deactivate'), 1);
      expect(find.text('Inactive'), findsWidgets);
      expect(find.text('Grace Okafor deactivated.'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Activate'), findsOneWidget);
    });

    testWidgets('activating brings them back', (tester) async {
      final g = await openPeople(tester, {
        'GET /pickers': (
          200,
          [pickerJson(isActive: false, status: 'inactive')],
        ),
        'POST /pickers/10/activate': (200, pickerJson()),
      });

      await tester.tap(find.widgetWithText(FilledButton, 'Activate'));
      await tester.pumpAndSettle();

      expect(g.backend.count('POST /pickers/10/activate'), 1);
      expect(find.text('Grace Okafor activated.'), findsOneWidget);
    });

    testWidgets('a refused change shows the message and keeps the state', (
      tester,
    ) async {
      await openPeople(tester, {
        'GET /pickers': (
          200,
          [pickerJson(isActive: false, status: 'inactive')],
        ),
        'POST /pickers/10/activate': (409, {'detail': 'Permission has ended'}),
      });

      await tester.tap(find.widgetWithText(FilledButton, 'Activate'));
      await tester.pumpAndSettle();

      expect(find.text('Permission has ended'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Activate'), findsOneWidget);
    });

    testWidgets('editing has no photo or pupil choice and keeps approval', (
      tester,
    ) async {
      final g = await openPeople(tester, {
        'GET /pickers': (200, [pickerJson()]),
        'PATCH /pickers/10': (200, pickerJson(name: 'Grace Obi')),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Edit'));
      await tester.pumpAndSettle();

      expect(find.text('Edit pickup person'), findsOneWidget);
      expect(
        find.textContaining('keep the school\'s approval'),
        findsOneWidget,
      );
      expect(find.text('Photo (optional)'), findsNothing);
      expect(find.text('Pupil'), findsNothing);

      await type(tester, 'Full name', 'Grace Obi');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(g.backend.bodies['PATCH /pickers/10'], {
        'picker_name': 'Grace Obi',
      });
      expect(find.text('Grace Obi'), findsOneWidget);
      expect(find.text('Saved changes to Grace Obi.'), findsOneWidget);
    });

    testWidgets('the pupil name opens that pupil', (tester) async {
      await openPeople(tester, {
        'GET /pickers': (200, [pickerJson()]),
        'GET /pupils/1': (200, pupilJson()),
      });

      await tester.tap(find.text('Chidi Eze'));
      await tester.pumpAndSettle();

      expect(find.text('Edit pupil'), findsOneWidget);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final g = await openPeople(tester, {
        'GET /pickers': (500, {'detail': 'boom'}),
      });
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /pickers'] = (200, all);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Grace Okafor'), findsOneWidget);
    });
  });
}
