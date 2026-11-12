import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/alerts/domain/security_alert.dart';
import 'package:pikva/features/admin/dashboard/domain/dashboard_data.dart';
import 'package:pikva/features/history/domain/release.dart';
import 'package:pikva/features/pickers/domain/pickup_person.dart';
import 'package:pikva/features/pupils/domain/pupil.dart';
import 'package:pikva/main.dart';

import 'alerts_test.dart' show alertJson;
import 'history_test.dart' show releaseJson;
import 'support/fakes.dart';

void main() {
  final now = DateTime(2026, 11, 12, 12, 0);

  Release release(int id, DateTime at, {int pupilId = 1, String? staff}) {
    final json = releaseJson(id: id, pupilId: pupilId, at: at);
    if (staff != null) json['verified_by'] = {'id': 30, 'name': staff};
    return Release.fromJson(json);
  }

  DashboardData data({
    List<Pupil>? pupils,
    List<PickupPerson>? people,
    List<Release>? releases,
    List<SecurityAlert>? alerts,
  }) => DashboardData(
    pupils: pupils ?? [Pupil.fromJson(pupilJson())],
    people: people ?? const [],
    releases: releases ?? const [],
    openAlerts: alerts ?? const [],
  );

  group('countText and mayHaveMore', () {
    test('a full list shows a plus', () {
      expect(countText(0), '0');
      expect(countText(199), '199');
      expect(countText(200), '200+');
      expect(countText(5, limit: 5), '5+');
    });

    test('a count may be low only if every row read was today', () {
      expect(mayHaveMore(200, 200), isTrue);
      expect(mayHaveMore(150, 200), isFalse); // older rows prove the cut-off
      expect(mayHaveMore(10, 10), isFalse); // list was not full
    });
  });

  group('DashboardData', () {
    test('counts pupils and only active pickup people', () {
      final d = data(
        pupils: [Pupil.fromJson(pupilJson()), Pupil.fromJson(pupilJson(id: 2))],
        people: [
          PickupPerson.fromJson(pickerJson()),
          PickupPerson.fromJson(pickerJson(id: 11, status: 'pending_approval')),
          PickupPerson.fromJson(
            pickerJson(id: 12, isActive: false, status: 'inactive'),
          ),
          PickupPerson.fromJson(pickerJson(id: 13, status: 'expired')),
        ],
      );
      expect(d.pupilCount, 2);
      expect(d.activePeople, 1);
      expect(d.waiting.map((p) => p.id), [11]);
    });

    test("today's releases use the phone's calendar day", () {
      final d = data(
        releases: [
          release(1, DateTime(2026, 11, 12, 11)),
          release(2, DateTime(2026, 11, 12, 8)),
          release(3, DateTime(2026, 11, 11, 15)),
        ],
      );
      expect(d.todaysReleases(now).map((r) => r.id), [1, 2]);
    });

    test('picked up counts each pupil once', () {
      final d = data(
        releases: [
          release(1, DateTime(2026, 11, 12, 11)),
          release(2, DateTime(2026, 11, 12, 10), pupilId: 2),
          release(3, DateTime(2026, 11, 12, 9)), // pupil 1 again
        ],
      );
      expect(d.pickedUpToday(now), '2');
    });

    test('picked up shows a plus when the read was cut off today', () {
      final rows = [
        for (var i = 0; i < dashboardLimit; i++)
          release(i, DateTime(2026, 11, 12, 11), pupilId: i),
      ];
      expect(data(releases: rows).pickedUpToday(now), '$dashboardLimit+');
    });

    test('alerts: count text and urgency', () {
      final plain = SecurityAlert.fromJson(alertJson());
      final urgent = SecurityAlert.fromJson(
        alertJson(id: 2, type: 'pickup_refused'),
      );
      expect(data(alerts: [plain]).hasUrgentAlert, isFalse);
      expect(data(alerts: [plain, urgent]).hasUrgentAlert, isTrue);
      expect(data(alerts: [plain, urgent]).openAlertsText, '2');
    });

    test('admins see who released; the model keeps it', () {
      expect(release(1, now, staff: 'Sam Gate').verifiedByName, 'Sam Gate');
      expect(release(1, now).verifiedByName, isNull);
    });
  });

  group('dashboard screen', () {
    // Releases are sent as UTC from local times, so "today" is the real
    // today on the machine running the test.
    DateTime today(int h, [int m = 0]) {
      final n = DateTime.now();
      return DateTime(
        n.year,
        n.month,
        n.day,
        0,
      ).add(Duration(hours: h, minutes: m));
    }

    Future<({FakeBackend backend})> openDashboard(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp({
        'GET /pickers': (
          200,
          [
            pickerJson(),
            pickerJson(id: 11, status: 'pending_approval'),
            pickerJson(id: 12, status: 'pending_approval'),
          ],
        ),
        'GET /releases': (200, []),
        'GET /alerts': (200, []),
        ...routes,
      }, role: 'school_admin');
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    testWidgets('admins land on the dashboard with the numbers', (
      tester,
    ) async {
      final g = await openDashboard(tester, {
        'GET /releases': (
          200,
          [
            releaseJson(id: 1, at: today(1)),
            releaseJson(id: 2, pupilId: 2, first: 'Amaka', at: today(0, 30)),
          ],
        ),
        'GET /alerts': (200, [alertJson(type: 'pickup_refused', pupilId: 1)]),
      });

      expect(find.textContaining('Welcome back, Ada Eze'), findsOneWidget);
      expect(find.textContaining('Sunrise School'), findsOneWidget);
      // 2 pupils, 1 active pickup person, 2 picked up today, 1 open alert.
      expect(find.text('2'), findsNWidgets(2));
      expect(find.text('1'), findsNWidgets(2));
      expect(find.text('Pupils'), findsOneWidget);
      expect(find.text('Active pickup people'), findsOneWidget);
      expect(find.text('Pupils picked up today'), findsOneWidget);
      expect(find.text('Open security alerts'), findsWidgets);

      // The requests: all four lists, the big ones capped at 200.
      expect(g.backend.queries['GET /releases']!['limit'], 200);
      expect(g.backend.queries['GET /alerts']!['limit'], 200);
      expect(g.backend.queries['GET /alerts']!['status'], 'open');
    });

    testWidgets("shows today's pickups with who released, and the alert", (
      tester,
    ) async {
      final r = releaseJson(id: 1, at: today(1));
      r['verified_by'] = {'id': 30, 'name': 'Sam Gate'};
      await openDashboard(tester, {
        'GET /releases': (200, [r]),
        'GET /alerts': (200, [alertJson(type: 'pickup_refused', pupilId: 1)]),
      });

      expect(find.text("Today's pickups"), findsOneWidget);
      expect(find.text('Chidi Eze'), findsWidgets);
      expect(
        find.text('by Grace Okafor · released by Sam Gate'),
        findsOneWidget,
      );
      expect(find.text('Pickup refused at the gate'), findsOneWidget);
      expect(find.text('All alerts'), findsOneWidget);
    });

    testWidgets('pickup people waiting for approval are announced', (
      tester,
    ) async {
      await openDashboard(tester, {});

      expect(
        find.textContaining('2 pickup people are waiting for approval'),
        findsOneWidget,
      );
    });

    testWidgets('quiet days read as all clear', (tester) async {
      await openDashboard(tester, {
        'GET /pickers': (200, [pickerJson()]),
      });

      expect(find.text('No pupils picked up yet today.'), findsOneWidget);
      expect(find.text('No open alerts. All clear.'), findsOneWidget);
      expect(find.textContaining('waiting for approval'), findsNothing);
      expect(find.text('All alerts'), findsNothing);
    });

    testWidgets('the alerts tile and link go to the Alerts tab', (
      tester,
    ) async {
      await openDashboard(tester, {
        'GET /alerts': (200, [alertJson()]),
      });

      await tester.tap(find.text('Open security alerts').first);
      await tester.pumpAndSettle();

      expect(find.text('Security alerts'), findsOneWidget);
      expect(find.text('Unrecognised code'), findsOneWidget);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final g = await openDashboard(tester, {
        'GET /releases': (500, {'detail': 'boom'}),
      });
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /releases'] = (200, []);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Welcome back'), findsOneWidget);
    });

    testWidgets('has Dashboard, Alerts, Approvals and More tabs', (
      tester,
    ) async {
      await openDashboard(tester, {});

      for (final label in ['Dashboard', 'Alerts', 'Approvals', 'More']) {
        expect(
          find.widgetWithText(NavigationDestination, label),
          findsOneWidget,
        );
      }
    });
  });
}
