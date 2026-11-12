import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/alerts/data/alert_repository.dart';
import 'package:pikva/features/admin/alerts/domain/security_alert.dart';
import 'package:pikva/features/pickers/data/picker_repository.dart';
import 'package:pikva/features/pupils/data/pupil_repository.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

Map<String, dynamic> alertJson({
  int id = 1,
  String type = 'invalid_code',
  String message = 'An unrecognised code was entered',
  int? pupilId,
  int? authorisationId,
  int? attemptedBy = 30,
  String createdAt = '2026-11-12T10:00:00Z',
  String? resolvedAt,
}) => {
  'id': id,
  'pupil_id': pupilId,
  'authorisation_id': authorisationId,
  'attempted_by': attemptedBy,
  'alert_type': type,
  'message': message,
  'created_at': createdAt,
  'resolved_at': resolvedAt,
  'status': resolvedAt == null ? 'open' : 'resolved',
};

void main() {
  group('SecurityAlert', () {
    test('parses the API row', () {
      final a = SecurityAlert.fromJson(alertJson(pupilId: 1));
      expect(a.isOpen, isTrue);
      expect(a.pupilId, 1);
      expect(a.title, 'Unrecognised code');
    });

    test('a resolved alert is not open', () {
      final a = SecurityAlert.fromJson(
        alertJson(resolvedAt: '2026-11-12T11:00:00Z'),
      );
      expect(a.isOpen, isFalse);
    });

    test('only repeated attempts and refusals are urgent', () {
      bool urgent(String t) =>
          SecurityAlert.fromJson(alertJson(type: t)).isUrgent;
      expect(urgent('repeated_failed_attempts'), isTrue);
      expect(urgent('pickup_refused'), isTrue);
      expect(urgent('invalid_code'), isFalse);
      expect(urgent('used_code'), isFalse);
    });

    test('unknown types are shown as written, readably', () {
      expect(alertTitle('pickup_refused'), 'Pickup refused at the gate');
      expect(alertTitle('something_new_happened'), 'something new happened');
    });

    test('the filter maps to the status query', () {
      expect(AlertFilter.open.query, 'open');
      expect(AlertFilter.resolved.query, 'resolved');
      expect(AlertFilter.all.query, isNull);
    });
  });

  group('AlertRepository', () {
    test('asks for one extra row and the status filter', () async {
      final rows = [for (var i = 0; i < 26; i++) alertJson(id: i)];
      final backend = FakeBackend({'GET /alerts': (200, rows)});
      final page = await AlertRepository(apiFor(backend))
          .list(AlertFilter.open);

      expect(page.alerts, hasLength(25));
      expect(page.hasMore, isTrue);
      final q = backend.queries['GET /alerts']!;
      expect(q['limit'], 26);
      expect(q['offset'], 0);
      expect(q['status'], 'open');
    });

    test('All sends no status, and paging sends the offset', () async {
      final backend = FakeBackend({'GET /alerts': (200, [])});
      await AlertRepository(apiFor(backend)).list(AlertFilter.all, offset: 25);

      final q = backend.queries['GET /alerts']!;
      expect(q.containsKey('status'), isFalse);
      expect(q['offset'], 25);
    });

    test('resolve posts and returns the updated alert', () async {
      final backend = FakeBackend({
        'POST /alerts/1/resolve': (
          200,
          alertJson(resolvedAt: '2026-11-12T11:00:00Z'),
        ),
      });
      final a = await AlertRepository(apiFor(backend)).resolve(1);
      expect(a.isOpen, isFalse);
      expect(backend.count('POST /alerts/1/resolve'), 1);
    });

    test('names come from pupils, pickup people and gate staff', () async {
      final backend = FakeBackend({
        'GET /pupils': (200, [pupilJson()]),
        'GET /pickers': (200, [pickerJson()]),
        'GET /schools/users': (
          200,
          [
            {'id': 30, 'name': 'Sam Gate'},
          ],
        ),
      });
      final api = apiFor(backend);
      final names = await AlertRepository(api)
          .names(pupils: PupilRepository(api), pickers: PickerRepository(api));

      expect(names.pupils[1], 'Chidi Eze');
      expect(names.people[10], 'Grace Okafor');
      expect(names.staff[30], 'Sam Gate');
      final q = backend.queries['GET /schools/users']!;
      expect(q['role'], 'gate_staff');
      expect(q['limit'], 500);
    });
  });

  group('alerts screen', () {
    Future<({FakeBackend backend})> openAlerts(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp({
        'GET /pickers': (200, [pickerJson()]),
        'GET /schools/users': (
          200,
          [
            {'id': 30, 'name': 'Sam Gate'},
          ],
        ),
        ...routes,
      }, role: 'school_admin');
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      // Admins land on the dashboard; the alerts are their own tab.
      await tester.tap(find.widgetWithText(NavigationDestination, 'Alerts'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    testWidgets('the Alerts tab shows alerts with names filled in', (
      tester,
    ) async {
      await openAlerts(tester, {
        'GET /alerts': (
          200,
          [
            alertJson(
              type: 'pickup_refused',
              message: 'Gate staff refused a pickup',
              pupilId: 1,
              authorisationId: 10,
            ),
            alertJson(id: 2, type: 'invalid_code'),
          ],
        ),
      });

      expect(find.text('Security alerts'), findsOneWidget);
      expect(find.text('Pickup refused at the gate'), findsOneWidget);
      expect(find.text('Open · urgent'), findsOneWidget);
      expect(find.text('Unrecognised code'), findsOneWidget);
      expect(find.text('Open'), findsWidgets);
      expect(find.text('Chidi Eze'), findsOneWidget);
      expect(find.text('Grace Okafor'), findsOneWidget);
      expect(find.text('Sam Gate'), findsWidgets);
    });

    testWidgets('an ID with no known name falls back to a number', (
      tester,
    ) async {
      await openAlerts(tester, {
        'GET /alerts': (
          200,
          [alertJson(pupilId: 99, authorisationId: 98, attemptedBy: 97)],
        ),
      });

      expect(find.text('Pupil #99'), findsOneWidget);
      expect(find.text('Pickup person #98'), findsOneWidget);
      expect(find.text('Staff #97'), findsOneWidget);
    });

    testWidgets('alerts still show when the names cannot be loaded', (
      tester,
    ) async {
      await openAlerts(tester, {
        'GET /alerts': (200, [alertJson(pupilId: 1, authorisationId: 10)]),
        'GET /schools/users': (500, {'detail': 'boom'}),
      });

      expect(find.text('Unrecognised code'), findsOneWidget);
      expect(find.text('Pupil #1'), findsOneWidget);
      expect(find.text('Pickup person #10'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('Mark resolved updates the card', (tester) async {
      final g = await openAlerts(tester, {
        'GET /alerts': (200, [alertJson()]),
        'POST /alerts/1/resolve': (
          200,
          alertJson(resolvedAt: '2026-11-12T11:00:00Z'),
        ),
      });

      await tester.tap(find.text('Mark resolved'));
      await tester.pumpAndSettle();

      expect(g.backend.count('POST /alerts/1/resolve'), 1);
      expect(find.text('Resolved'), findsWidgets);
      expect(find.text('Mark resolved'), findsNothing);
    });

    testWidgets('a refused resolve shows the message and keeps it open', (
      tester,
    ) async {
      await openAlerts(tester, {
        'GET /alerts': (200, [alertJson()]),
        'POST /alerts/1/resolve': (
          409,
          {'detail': 'Alert is already resolved'},
        ),
      });

      await tester.tap(find.text('Mark resolved'));
      await tester.pumpAndSettle();

      expect(find.text('Alert is already resolved'), findsOneWidget);
      expect(find.text('Mark resolved'), findsOneWidget);
    });

    testWidgets('filters reload with the chosen status', (tester) async {
      final g = await openAlerts(tester, {
        'GET /alerts': (200, [alertJson()]),
      });
      expect(g.backend.queries['GET /alerts']!['status'], 'open');

      g.backend.routes['GET /alerts'] = (
        200,
        [
          alertJson(
            id: 5,
            type: 'used_code',
            resolvedAt: '2026-11-12T11:00:00Z',
          ),
        ],
      );
      await tester.tap(find.widgetWithText(ChoiceChip, 'Resolved'));
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /alerts']!['status'], 'resolved');
      expect(find.text('Code used again'), findsOneWidget);
      expect(find.text('Unrecognised code'), findsNothing);

      await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
      await tester.pumpAndSettle();
      expect(g.backend.queries['GET /alerts']!.containsKey('status'), isFalse);
    });

    testWidgets('empty states differ for Open and the others', (tester) async {
      final g = await openAlerts(tester, {'GET /alerts': (200, [])});
      expect(find.text('No open alerts. All clear.'), findsOneWidget);

      await tester.tap(find.widgetWithText(ChoiceChip, 'Resolved'));
      await tester.pumpAndSettle();
      expect(find.text('No alerts here yet.'), findsOneWidget);
      // The dashboard asked once, then Open, then Resolved.
      expect(g.backend.count('GET /alerts'), 3);
    });

    testWidgets('Show older loads the next page', (tester) async {
      final g = await openAlerts(tester, {'GET /alerts': (200, [])});
      // Tall enough that every card of both pages is built (lists are lazy).
      tester.view.physicalSize = const Size(800, 12000);
      // Replace the data with a paged handler, then reload.
      g.backend.handlers['GET /alerts'] = (o) {
        final offset = o.queryParameters['offset'] as int;
        final count = offset == 0 ? 26 : 2;
        return (
          200,
          [
            for (var i = 0; i < count; i++)
              alertJson(
                id: offset + i + 1,
                message: 'Alert number ${offset + i + 1}',
              ),
          ],
        );
      };
      await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Alert number'), findsNWidgets(25));
      await tester.ensureVisible(find.text('Show older'));
      await tester.tap(find.text('Show older'));
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /alerts']!['offset'], 25);
      expect(find.textContaining('Alert number'), findsNWidgets(27));
      expect(find.text('Show older'), findsNothing);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final g = await openAlerts(tester, {
        'GET /alerts': (500, {'detail': 'boom'}),
      });
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /alerts'] = (200, [alertJson()]);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Unrecognised code'), findsOneWidget);
    });

    testWidgets('the Account tab is there', (tester) async {
      await openAlerts(tester, {'GET /alerts': (200, [])});

      await tester.tap(find.widgetWithText(NavigationDestination, 'Account'));
      await tester.pumpAndSettle();

      expect(find.text('Your details'), findsOneWidget);
    });
  });
}
