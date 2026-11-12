import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/auth/data/auth_repository.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/presentation/auth_controller.dart';
import 'package:pikva/features/pupils/data/pupil_repository.dart';
import 'package:pikva/features/pupils/domain/pupil.dart';
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
  group('Pupil', () {
    test('parses the API response', () {
      final p = Pupil.fromJson(
        pupilJson(photoUpdatedAt: '2026-11-01T10:00:00Z'),
      );
      expect(p.fullName, 'Chidi Eze');
      expect(p.initials, 'CE');
      expect(p.hasPhoto, isTrue);
    });

    test('no photo when photo_updated_at is null', () {
      expect(Pupil.fromJson(pupilJson()).hasPhoto, isFalse);
    });

    test('age counts whole years', () {
      final p = Pupil.fromJson(pupilJson(dob: '2018-03-12'));
      expect(p.ageOn(DateTime(2026, 3, 11)), 7);
      expect(p.ageOn(DateTime(2026, 3, 12)), 8);
      expect(p.ageOn(DateTime(2026, 11, 12)), 8);
    });
  });

  group('PupilRepository', () {
    final bytes = Uint8List.fromList([1, 2, 3]);
    final withPhoto = Pupil.fromJson(
      pupilJson(photoUpdatedAt: '2026-11-01T10:00:00Z'),
    );

    test('list returns the pupils', () async {
      final backend = FakeBackend({
        'GET /pupils': (200, [pupilJson(), pupilJson(id: 2, first: 'Amaka')]),
      });
      final list = await PupilRepository(apiFor(backend)).list();
      expect(list.map((p) => p.firstName), ['Chidi', 'Amaka']);
    });

    test('a pupil without a photo makes no request', () async {
      final backend = FakeBackend();
      final repo = PupilRepository(apiFor(backend));
      expect(await repo.photo(Pupil.fromJson(pupilJson())), isNull);
      expect(backend.calls, isEmpty);
    });

    test('photo bytes are fetched once, then cached', () async {
      final backend = FakeBackend({'GET /pupils/1/photo': (200, bytes)});
      final repo = PupilRepository(apiFor(backend));
      expect(await repo.photo(withPhoto), bytes);
      expect(await repo.photo(withPhoto), bytes);
      expect(backend.count('GET /pupils/1/photo'), 1);
    });

    test('clearCache forgets photos (sign out)', () async {
      final backend = FakeBackend({'GET /pupils/1/photo': (200, bytes)});
      final repo = PupilRepository(apiFor(backend));
      await repo.photo(withPhoto);
      repo.clearCache();
      await repo.photo(withPhoto);
      expect(backend.count('GET /pupils/1/photo'), 2);
    });

    test('a changed photo is fetched again', () async {
      final backend = FakeBackend({'GET /pupils/1/photo': (200, bytes)});
      final repo = PupilRepository(apiFor(backend));
      await repo.photo(withPhoto);
      final newer = Pupil.fromJson(
        pupilJson(photoUpdatedAt: '2026-11-02T10:00:00Z'),
      );
      await repo.photo(newer);
      expect(backend.count('GET /pupils/1/photo'), 2);
    });

    test('a 404 photo is treated as no photo', () async {
      final repo = PupilRepository(apiFor(FakeBackend()));
      expect(await repo.photo(withPhoto), isNull);
    });
  });

  group('parent screens', () {
    ({FakeBackend backend, AuthController auth, PupilRepository pupils}) app(
      Map<String, (int, Object)> routes,
    ) {
      final backend = FakeBackend({'GET /auth/me': (200, _me), ...routes});
      final tokens = MemoryTokenStore()..write('t');
      final api = apiFor(backend, token: tokens.read);
      return (
        backend: backend,
        auth: AuthController(AuthRepository(api: api, tokens: tokens)),
        pupils: PupilRepository(api),
      );
    }

    testWidgets('lists the children and opens one', (tester) async {
      final a = app({
        'GET /pupils': (200, [pupilJson(), pupilJson(id: 2, first: 'Amaka')]),
        'GET /pupils/2': (200, pupilJson(id: 2, first: 'Amaka')),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, pupils: a.pupils));
      await tester.pumpAndSettle();

      expect(find.text('My children'), findsOneWidget);
      expect(find.text('Chidi Eze'), findsOneWidget);
      expect(find.text('Amaka Eze'), findsOneWidget);
      expect(find.text('Born 12 Mar 2018'), findsNWidgets(2));

      await tester.tap(find.text('Amaka Eze'));
      await tester.pumpAndSettle();

      expect(find.text('Child'), findsOneWidget);
      expect(find.text('Date of birth'), findsOneWidget);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('My children'), findsOneWidget);
    });

    testWidgets('shows a message when there are no children', (tester) async {
      final a = app({'GET /pupils': (200, <Object>[])});
      await tester.pumpWidget(PikvaApp(auth: a.auth, pupils: a.pupils));
      await tester.pumpAndSettle();

      expect(find.textContaining('No children yet'), findsOneWidget);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final a = app({
        'GET /pupils': (500, {'detail': 'boom'}),
      });
      await tester.pumpWidget(PikvaApp(auth: a.auth, pupils: a.pupils));
      await tester.pumpAndSettle();

      expect(find.text('Try again'), findsOneWidget);
      expect(find.textContaining('boom'), findsNothing);

      a.backend.routes['GET /pupils'] = (200, [pupilJson()]);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Chidi Eze'), findsOneWidget);
    });
  });
}
