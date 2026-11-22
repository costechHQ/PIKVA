import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/history/data/release_repository.dart';
import 'package:pikva/features/history/domain/release.dart';
import 'package:pikva/features/history/presentation/history_screen.dart';
import 'package:pikva/features/pupils/data/pupil_repository.dart';
import 'package:pikva/main.dart';
import 'package:pikva/shared/format.dart';

import 'support/fakes.dart';

/// A release row as the API sends it. [at] is local time, sent as UTC.
Map<String, dynamic> releaseJson({
  int id = 1,
  int pupilId = 1,
  String first = 'Chidi',
  String last = 'Eze',
  String picker = 'Grace Okafor',
  String relationship = 'Aunt',
  String method = 'qr',
  required DateTime at,
}) => {
  'id': id,
  'pupil': {
    'id': pupilId,
    'first_name': first,
    'last_name': last,
    'photo_url': null,
  },
  'authorisation': {
    'id': 10,
    'picker_name': picker,
    'relationship': relationship,
    'photo_updated_at': null,
  },
  'verified_by': null,
  'verification_method': method,
  'result': 'released',
  'released_at': at.toUtc().toIso8601String(),
};

void main() {
  final now = DateTime(2026, 11, 12, 12, 0);

  group('formatting', () {
    test('formatTime uses a 12-hour clock', () {
      expect(formatTime(DateTime(2026, 11, 12, 0, 5)), '12:05 AM');
      expect(formatTime(DateTime(2026, 11, 12, 9, 30)), '9:30 AM');
      expect(formatTime(DateTime(2026, 11, 12, 12, 0)), '12:00 PM');
      expect(formatTime(DateTime(2026, 11, 12, 15, 45)), '3:45 PM');
    });

    test('formatDayLabel', () {
      expect(formatDayLabel(DateTime(2026, 11, 12, 1), now), 'Today');
      expect(formatDayLabel(DateTime(2026, 11, 11, 23), now), 'Yesterday');
      expect(formatDayLabel(DateTime(2026, 11, 3), now), 'Tuesday, 3 November');
      expect(
        formatDayLabel(DateTime(2025, 12, 25), now),
        'Thursday, 25 December 2025',
      );
    });
  });

  group('Release', () {
    test('parses the API row', () {
      final r = Release.fromJson(releaseJson(at: DateTime(2026, 11, 12, 9)));
      expect(r.pupilName, 'Chidi Eze');
      expect(r.pickerName, 'Grace Okafor');
      expect(r.relationship, 'Aunt');
      expect(r.viaQr, isTrue);
      expect(r.methodLabel, 'QR code');
    });

    test('a typed-in code is labelled as such', () {
      final r = Release.fromJson(
        releaseJson(method: 'manual', at: DateTime(2026, 11, 12, 9)),
      );
      expect(r.viaQr, isFalse);
      expect(r.methodLabel, 'Code entered');
    });

    test('groups newest-first releases by local day', () {
      Release at(int id, DateTime t) =>
          Release.fromJson(releaseJson(id: id, at: t));
      final days = groupReleasesByDay([
        at(1, DateTime(2026, 11, 12, 14)),
        at(2, DateTime(2026, 11, 12, 9)),
        at(3, DateTime(2026, 11, 11, 15)),
        at(4, DateTime(2026, 11, 3, 15)),
      ], now);

      expect(days.map((d) => d.label), [
        'Today',
        'Yesterday',
        'Tuesday, 3 November',
      ]);
      expect(days.map((d) => d.releases.length), [2, 1, 1]);
    });
  });

  group('ReleaseRepository', () {
    test('asks for one extra row and reports whether there is more', () async {
      final rows = [
        for (var i = 0; i < 26; i++)
          releaseJson(id: i, at: DateTime(2026, 11, 12, 9)),
      ];
      final backend = FakeBackend({'GET /releases': (200, rows)});
      final page = await ReleaseRepository(apiFor(backend)).list();

      expect(page.releases, hasLength(25));
      expect(page.hasMore, isTrue);
      final q = backend.queries['GET /releases']!;
      expect(q['limit'], 26);
      expect(q['offset'], 0);
      expect(q.containsKey('pupil_id'), isFalse);
      expect(q.containsKey('since'), isFalse);
    });

    test('a short page has no more', () async {
      final backend = FakeBackend({
        'GET /releases': (200, [releaseJson(at: DateTime(2026, 11, 12, 9))]),
      });
      final page = await ReleaseRepository(apiFor(backend)).list();
      expect(page.hasMore, isFalse);
    });

    test(
      'sends the pupil, offset and the day as local midnights in UTC',
      () async {
        final backend = FakeBackend({'GET /releases': (200, [])});
        await ReleaseRepository(apiFor(backend))
            .list(pupilId: 2, offset: 25, day: DateTime(2026, 11, 5, 17, 30));

        final q = backend.queries['GET /releases']!;
        expect(q['pupil_id'], 2);
        expect(q['offset'], 25);
        expect(
          DateTime.parse(q['since'] as String),
          DateTime(2026, 11, 5).toUtc(),
        );
        expect(
          DateTime.parse(q['until'] as String),
          DateTime(2026, 11, 6).toUtc(),
        );
        expect((q['since'] as String).endsWith('Z'), isTrue);
      },
    );
  });

  group('history screen', () {
    ({FakeBackend backend, Widget app}) screen({
      Map<String, (int, Object)> routes = const {},
    }) {
      final backend = FakeBackend({
        'GET /pupils': (200, [pupilJson(), pupilJson(id: 2, first: 'Amaka')]),
        ...routes,
      });
      final api = apiFor(backend);
      final app = MaterialApp(
        home: HistoryScreen(
          pupils: PupilRepository(api),
          releases: ReleaseRepository(api),
          clock: () => now,
        ),
      );
      return (backend: backend, app: app);
    }

    testWidgets('shows releases grouped by day', (tester) async {
      final s = screen(
        routes: {
          'GET /releases': (
            200,
            [
              releaseJson(id: 1, at: DateTime(2026, 11, 12, 9, 30)),
              releaseJson(
                id: 2,
                pupilId: 2,
                first: 'Amaka',
                picker: 'Tunde Bello',
                relationship: 'Driver',
                method: 'manual',
                at: DateTime(2026, 11, 11, 15, 45),
              ),
            ],
          ),
        },
      );
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('YESTERDAY'), findsOneWidget);
      expect(find.text('Chidi Eze'), findsOneWidget);
      expect(find.text('Picked up by Grace Okafor (Aunt)'), findsOneWidget);
      expect(find.text('Collected · QR code'), findsOneWidget);
      expect(find.text('9:30 AM'), findsOneWidget);
      expect(find.text('Amaka Eze'), findsOneWidget);
      expect(find.text('Collected · Code entered'), findsOneWidget);
      expect(find.text('3:45 PM'), findsOneWidget);
    });

    testWidgets('filtering by child reloads with that pupil', (tester) async {
      final s = screen(
        routes: {
          'GET /releases': (
            200,
            [releaseJson(at: DateTime(2026, 11, 12, 9, 30))],
          ),
        },
      );
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      s.backend.routes['GET /releases'] = (200, []);
      await tester.tap(find.text('Amaka'));
      await tester.pumpAndSettle();

      expect(s.backend.queries['GET /releases']!['pupil_id'], 2);
      expect(find.text('Chidi Eze'), findsNothing);
      expect(find.textContaining('No pickups recorded yet'), findsOneWidget);
    });

    testWidgets('a single child has no filter chips', (tester) async {
      final s = screen(
        routes: {
          'GET /pupils': (200, [pupilJson()]),
          'GET /releases': (200, []),
        },
      );
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      expect(find.text('All children'), findsNothing);
    });

    testWidgets('picking a day filters, and All days clears it', (
      tester,
    ) async {
      final s = screen(routes: {'GET /releases': (200, [])});
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Pick a day'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      final q = s.backend.queries['GET /releases']!;
      expect(
        DateTime.parse(q['since'] as String),
        DateTime(2026, 11, 12).toUtc(),
      );
      expect(find.text('12 Nov 2026'), findsOneWidget);
      expect(find.text('No pickups on this day.'), findsOneWidget);

      await tester.tap(find.text('All days'));
      await tester.pumpAndSettle();

      expect(s.backend.queries['GET /releases']!.containsKey('since'), isFalse);
      expect(find.text('Pick a day'), findsOneWidget);
    });

    testWidgets('Show older loads the next page after the ones shown', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(800, 6000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final s = screen();
      s.backend.handlers['GET /releases'] = (o) {
        final offset = o.queryParameters['offset'] as int;
        final count = offset == 0 ? 26 : 3;
        return (
          200,
          [
            for (var i = 0; i < count; i++)
              releaseJson(
                id: offset + i,
                picker: 'Person ${offset + i}',
                at: DateTime(
                  2026,
                  11,
                  12,
                  9,
                ).subtract(Duration(minutes: offset + i)),
              ),
          ],
        );
      };
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      expect(find.textContaining('Picked up by Person'), findsNWidgets(25));
      expect(find.text('Picked up by Person 25 (Aunt)'), findsNothing);

      await tester.tap(find.text('Show older'));
      await tester.pumpAndSettle();

      expect(s.backend.queries['GET /releases']!['offset'], 25);
      expect(find.textContaining('Picked up by Person'), findsNWidgets(28));
      expect(find.text('Show older'), findsNothing);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final s = screen(
        routes: {
          'GET /pupils': (500, {'detail': 'boom'}),
        },
      );
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      expect(find.text('Try again'), findsOneWidget);

      s.backend.routes['GET /pupils'] = (200, [pupilJson()]);
      s.backend.routes['GET /releases'] = (
        200,
        [releaseJson(at: DateTime(2026, 11, 12, 9))],
      );
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Chidi Eze'), findsOneWidget);
    });

    testWidgets('no children shows a message and asks for no history', (
      tester,
    ) async {
      final s = screen(routes: {'GET /pupils': (200, [])});
      await tester.pumpWidget(s.app);
      await tester.pumpAndSettle();

      expect(find.textContaining('No children yet'), findsOneWidget);
      expect(s.backend.count('GET /releases'), 0);
    });
  });

  group('admin history', () {
    Future<({FakeBackend backend})> openAdminHistory(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3500);
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
      await tester.tap(find.widgetWithText(NavigationDestination, 'More'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pickup history'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    testWidgets('shows every release with who released the pupil', (
      tester,
    ) async {
      final r = releaseJson(id: 1, at: DateTime(2026, 11, 12, 9, 30));
      r['verified_by'] = {'id': 30, 'name': 'Sam Gate'};
      await openAdminHistory(tester, {
        'GET /releases': (200, [r]),
      });

      expect(find.text('Picked up by Grace Okafor (Aunt)'), findsOneWidget);
      expect(find.text('Released by Sam Gate'), findsOneWidget);
      expect(find.text('Collected · QR code'), findsOneWidget);
    });

    testWidgets('parents are never shown who released their child', (
      tester,
    ) async {
      final a = parentApp({
        'GET /releases': (
          200,
          [releaseJson(id: 1, at: DateTime(2026, 11, 12, 9, 30))],
        ),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();

      expect(find.text('Picked up by Grace Okafor (Aunt)'), findsOneWidget);
      expect(find.textContaining('Released by'), findsNothing);
    });

    testWidgets('the pupil filter is a menu with All pupils', (tester) async {
      final g = await openAdminHistory(tester, {});

      expect(find.byType(ChoiceChip), findsNothing);
      await tester.tap(find.text('All pupils'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Amaka Eze').last);
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /releases']!['pupil_id'], 2);

      await tester.tap(find.text('Amaka Eze'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('All pupils').last);
      await tester.pumpAndSettle();

      expect(
        g.backend.queries['GET /releases']!.containsKey('pupil_id'),
        isFalse,
      );
    });

    testWidgets('the day filter works for admins too', (tester) async {
      final g = await openAdminHistory(tester, {});

      await tester.tap(find.text('Pick a day'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /releases']!.containsKey('since'), isTrue);
      expect(find.text('No pickups on this day.'), findsOneWidget);
    });

    testWidgets('the back arrow returns to the More menu', (tester) async {
      await openAdminHistory(tester, {});

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(find.text('Account'), findsOneWidget);
    });
  });

  testWidgets('the History tab is reachable from the parent bar', (
    tester,
  ) async {
    final a = parentApp({'GET /releases': (200, [])});
    await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
    await tester.pumpAndSettle();

    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();

    expect(find.text('Pickup history'), findsOneWidget);
    expect(a.backend.count('GET /releases'), 1);
  });
}
