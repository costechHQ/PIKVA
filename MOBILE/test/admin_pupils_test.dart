import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/pupils/domain/pupil_rules.dart';
import 'package:pikva/features/admin/users/data/user_repository.dart';
import 'package:pikva/features/history/data/release_repository.dart';
import 'package:pikva/features/pickers/data/picker_repository.dart';
import 'package:pikva/features/pupils/data/pupil_repository.dart';
import 'package:pikva/features/pupils/domain/pupil.dart';
import 'package:pikva/main.dart';
import 'package:pikva/shared/form_result.dart';

import 'history_test.dart' show releaseJson;
import 'support/fakes.dart';
import 'users_test.dart' show userJson;

void main() {
  final today = DateTime(2026, 11, 22);
  final chidi = Pupil.fromJson(pupilJson(dob: '2018-03-12'));

  group('isoDate', () {
    test('pads month and day', () {
      expect(isoDate(DateTime(2018, 3, 2)), '2018-03-02');
      expect(isoDate(DateTime(2018, 12, 25)), '2018-12-25');
    });
  });

  group('newPupilBody', () {
    FormResult build({
      int? parentId = 7,
      String first = ' Chidi ',
      String last = ' Eze ',
      DateTime? dob,
    }) => newPupilBody(
      parentId: parentId,
      firstName: first,
      lastName: last,
      dateOfBirth: dob ?? DateTime(2018, 3, 12),
      today: today,
    );

    test('builds a trimmed body with an ISO date', () {
      expect(build().body, {
        'parent_id': 7,
        'first_name': 'Chidi',
        'last_name': 'Eze',
        'date_of_birth': '2018-03-12',
      });
    });

    test('says what is wrong, with the web wording', () {
      expect(build(parentId: null).error, "Choose the pupil's parent.");
      expect(build(first: ' ').error, "Enter the pupil's first and last name.");
      expect(build(last: '').error, "Enter the pupil's first and last name.");
      expect(
        build(first: 'x' * 101).error,
        'Names can be at most 100 characters.',
      );
      expect(
        newPupilBody(
          parentId: 7,
          firstName: 'A',
          lastName: 'B',
          dateOfBirth: null,
          today: today,
        ).error,
        "Enter the pupil's date of birth.",
      );
      expect(
        build(dob: DateTime(2026, 11, 23)).error,
        'The date of birth cannot be in the future.',
      );
    });

    test('a birthday of today is allowed', () {
      expect(build(dob: DateTime(2026, 11, 22)).isOk, isTrue);
    });
  });

  group('pupilChanges', () {
    FormResult changes(String first, String last, DateTime dob) => pupilChanges(
      chidi,
      firstName: first,
      lastName: last,
      dateOfBirth: dob,
      today: today,
    );

    test('an untouched form sends nothing', () {
      expect(changes('Chidi', 'Eze', DateTime(2018, 3, 12)).body, isEmpty);
      expect(changes(' Chidi ', 'Eze', DateTime(2018, 3, 12)).body, isEmpty);
    });

    test('only changed fields are sent', () {
      expect(changes('Chidi', 'Obi', DateTime(2018, 3, 12)).body, {
        'last_name': 'Obi',
      });
      expect(changes('Chidi', 'Eze', DateTime(2018, 4, 1)).body, {
        'date_of_birth': '2018-04-01',
      });
    });

    test('still validates', () {
      expect(
        changes('', 'Eze', DateTime(2018, 3, 12)).error,
        "Enter the pupil's first and last name.",
      );
    });
  });

  group('search', () {
    final pupils = [
      Pupil.fromJson(pupilJson(first: 'Chídí', last: 'Eze')),
      Pupil.fromJson(pupilJson(id: 2, first: 'Amaka', last: 'Obi')),
      Pupil.fromJson(pupilJson(id: 3, first: 'Ọlá', last: 'Bello')),
    ];

    test('ignores case and accents', () {
      expect(searchPupils(pupils, 'chidi').map((p) => p.id), [1]);
      expect(searchPupils(pupils, 'OLA').map((p) => p.id), [3]);
    });

    test('every word must match, across pupil and parent name', () {
      expect(searchPupils(pupils, 'amaka obi').map((p) => p.id), [2]);
      expect(searchPupils(pupils, 'amaka bello'), isEmpty);
      // A pupil's name and the parent's name count together.
      expect(searchPupils(pupils, 'amaka eze').map((p) => p.id), [2]);
      // The fixture parent is "Ada Eze" for everyone.
      expect(searchPupils(pupils, 'ada').length, 3);
    });

    test('an empty search keeps everyone', () {
      expect(searchPupils(pupils, '  ').length, 3);
    });

    test('fold handles dotted vowels and combining marks', () {
      expect(fold('Ẹniọlá'), 'eniola');
      expect(fold('Café'), 'cafe');
    });
  });

  group('repositories', () {
    test('create, update and remove photo', () async {
      final backend = FakeBackend({
        'POST /pupils': (201, pupilJson(id: 9)),
        'PATCH /pupils/9': (200, pupilJson(id: 9, last: 'New')),
        'PUT /pupils/9/photo': (
          200,
          pupilJson(id: 9, photoUpdatedAt: '2026-11-22T10:00:00Z'),
        ),
        'DELETE /pupils/9/photo': (200, pupilJson(id: 9)),
      });
      final repo = PupilRepository(apiFor(backend));

      expect((await repo.create({'a': 1})).id, 9);
      expect(backend.bodies['POST /pupils'], {'a': 1});
      expect((await repo.update(9, {'last_name': 'New'})).lastName, 'New');
      expect(backend.bodies['PATCH /pupils/9'], {'last_name': 'New'});
      expect((await repo.setPhoto(9, jpegPhoto())).hasPhoto, isTrue);
      expect(await repo.removePhoto(9), isA<Pupil>());
    });

    test('setPhoto sends a multipart "photo" file by PUT', () async {
      final backend = FakeBackend({'PUT /pupils/9/photo': (200, pupilJson())});
      await PupilRepository(apiFor(backend)).setPhoto(9, jpegPhoto());
      expect(backend.calls, ['PUT /pupils/9/photo']);
    });

    test('parents asks for the school\'s parents, up to 500', () async {
      final backend = FakeBackend({
        'GET /schools/users': (200, [userJson()]),
      });
      final list = await UserRepository(apiFor(backend)).parents();
      expect(list.single.name, 'Bayo Adeyemi');
      final q = backend.queries['GET /schools/users']!;
      expect(q['role'], 'parent');
      expect(q['limit'], 500);
    });

    test('pickers and releases can be limited to one pupil', () async {
      final backend = FakeBackend({
        'GET /pickers': (200, []),
        'GET /releases': (200, []),
      });
      final api = apiFor(backend);
      await PickerRepository(api).list(pupilId: 4);
      await ReleaseRepository(api).latest(10, pupilId: 4);
      expect(backend.queries['GET /pickers']!['pupil_id'], 4);
      expect(backend.queries['GET /releases']!['pupil_id'], 4);
      expect(backend.queries['GET /releases']!['limit'], 10);

      await PickerRepository(api).list();
      expect(backend.queries['GET /pickers']!.containsKey('pupil_id'), isFalse);
    });
  });

  group('admin pupils screens', () {
    Future<({FakeBackend backend})> openPupils(
      WidgetTester tester,
      Map<String, (int, Object)> routes, {
      FakePhotoPicker? picker,
    }) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp(
        {
          'GET /pickers': (200, []),
          'GET /releases': (200, []),
          'GET /alerts': (200, []),
          'GET /schools/users': (
            200,
            [userJson(id: 7, name: 'Ada Eze', email: 'a@example.com')],
          ),
          ...routes,
        },
        role: 'school_admin',
        photoPicker: picker,
      );
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'More'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pupils'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    Future<void> type(WidgetTester tester, String label, String text) =>
        tester.enterText(find.widgetWithText(TextField, label), text);

    testWidgets('lists pupils with parent and active pickup people', (
      tester,
    ) async {
      await openPupils(tester, {
        'GET /pickers': (
          200,
          [pickerJson(), pickerJson(id: 11, pupilId: 1, name: 'Second')],
        ),
      });

      expect(find.text('2 pupils'), findsOneWidget);
      expect(find.text('Chidi Eze'), findsOneWidget);
      expect(find.text('Amaka Eze'), findsOneWidget);
      expect(find.text('Ada Eze · 08000000000'), findsNWidgets(2));
      expect(find.text('2 active pickup people'), findsOneWidget);
      // Amaka has nobody who can collect her.
      expect(find.text('No active pickup people'), findsOneWidget);
    });

    testWidgets('search narrows the list and says how many match', (
      tester,
    ) async {
      await openPupils(tester, {});

      await tester.enterText(find.byType(TextField).first, 'amaka');
      await tester.pumpAndSettle();

      expect(find.text('1 of 2 pupils match "amaka".'), findsOneWidget);
      expect(find.text('Chidi Eze'), findsNothing);
      expect(find.text('Amaka Eze'), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, 'zzz');
      await tester.pumpAndSettle();
      expect(find.text('No pupils match this search.'), findsOneWidget);

      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('2 pupils'), findsOneWidget);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final g = await openPupils(tester, {
        'GET /pupils': (500, {'detail': 'boom'}),
      });
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /pupils'] = (200, [pupilJson()]);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Chidi Eze'), findsOneWidget);
    });

    testWidgets('adding a pupil chooses a parent and sends the details', (
      tester,
    ) async {
      final g = await openPupils(tester, {
        'POST /pupils': (201, pupilJson(id: 9, first: 'Zara', last: 'Obi')),
      });

      await tester.tap(find.text('Add pupil'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose the parent'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ada Eze · a@example.com').last);
      await tester.pumpAndSettle();
      await type(tester, 'First name', 'Zara');
      await type(tester, 'Last name', 'Obi');
      await tester.tap(find.widgetWithText(InkWell, 'Date of birth'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Add pupil'));
      await tester.pumpAndSettle();

      final body = g.backend.bodies['POST /pupils'] as Map;
      final now = DateTime.now();
      expect(body['parent_id'], 7);
      expect(body['first_name'], 'Zara');
      expect(body['last_name'], 'Obi');
      expect(
        body['date_of_birth'],
        isoDate(DateTime(now.year - 6, now.month, now.day)),
      );
      expect(find.text('Zara Obi was added.'), findsOneWidget);
      expect(find.text('3 pupils'), findsOneWidget);
    });

    testWidgets('the parent filter narrows the choices', (tester) async {
      await openPupils(tester, {
        'GET /schools/users': (
          200,
          [
            userJson(id: 7, name: 'Ada Eze', email: 'a@example.com'),
            userJson(id: 8, name: 'Tunde Bello', email: 'tb@example.com'),
          ],
        ),
      });

      await tester.tap(find.text('Add pupil'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Find a parent'),
        'tunde',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose the parent'));
      await tester.pumpAndSettle();

      expect(find.text('Tunde Bello · tb@example.com'), findsWidgets);
      expect(find.text('Ada Eze · a@example.com'), findsNothing);
    });

    testWidgets('a school with no parents says to add one first', (
      tester,
    ) async {
      await openPupils(tester, {'GET /schools/users': (200, [])});

      await tester.tap(find.text('Add pupil'));
      await tester.pumpAndSettle();

      expect(find.textContaining('has no parents yet'), findsOneWidget);
    });

    testWidgets('the form catches problems before sending', (tester) async {
      final g = await openPupils(tester, {});

      await tester.tap(find.text('Add pupil'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Add pupil'));
      await tester.pumpAndSettle();

      expect(find.text("Choose the pupil's parent."), findsOneWidget);
      expect(g.backend.count('POST /pupils'), 0);
    });

    testWidgets(
      'if the photo fails the pupil is still saved, and retry does not duplicate',
      (tester) async {
        final picker = FakePhotoPicker(result: jpegPhoto());
        final g = await openPupils(tester, {
          'POST /pupils': (201, pupilJson(id: 9, first: 'Zara', last: 'Obi')),
          'PUT /pupils/9/photo': (
            413,
            {'detail': 'The photo must be 5 MB or smaller'},
          ),
        }, picker: picker);

        await tester.tap(find.text('Add pupil'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Choose the parent'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Ada Eze · a@example.com').last);
        await tester.pumpAndSettle();
        await type(tester, 'First name', 'Zara');
        await type(tester, 'Last name', 'Obi');
        await tester.tap(find.widgetWithText(InkWell, 'Date of birth'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('OK'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Choose photo'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'Add pupil'));
        await tester.pumpAndSettle();

        expect(
          find.textContaining(
            "details were saved, but the photo was not uploaded",
          ),
          findsOneWidget,
        );
        expect(find.text('Edit pupil'), findsOneWidget);

        g.backend.routes['PATCH /pupils/9'] = (200, pupilJson(id: 9));
        g.backend.routes['PUT /pupils/9/photo'] = (
          200,
          pupilJson(id: 9, photoUpdatedAt: '2026-11-22T10:00:00Z'),
        );
        await tester.tap(find.widgetWithText(FilledButton, 'Save changes'));
        await tester.pumpAndSettle();

        expect(g.backend.count('POST /pupils'), 1);
        expect(g.backend.count('PUT /pupils/9/photo'), 2);
        expect(find.text('Edit pupil'), findsNothing);
      },
    );

    testWidgets(
      'the detail page shows parent, pickup people and recent pickups',
      (tester) async {
        final r = releaseJson(id: 1, at: DateTime(2026, 11, 20, 15, 30));
        r['verified_by'] = {'id': 30, 'name': 'Sam Gate'};
        final g = await openPupils(tester, {
          'GET /pupils/1': (200, pupilJson()),
          'GET /pickers': (
            200,
            [
              pickerJson(),
              pickerJson(
                id: 11,
                name: 'Waiting One',
                status: 'pending_approval',
              ),
            ],
          ),
          'GET /releases': (200, [r]),
        });

        await tester.tap(find.text('Chidi Eze'));
        await tester.pumpAndSettle();

        expect(g.backend.queries['GET /pickers']!['pupil_id'], 1);
        expect(g.backend.queries['GET /releases']!['pupil_id'], 1);
        expect(g.backend.queries['GET /releases']!['limit'], 10);
        expect(find.text('Parent'), findsOneWidget);
        expect(find.text('a@example.com'), findsOneWidget);
        expect(find.text('Grace Okafor'), findsOneWidget);
        expect(find.text('Waiting One'), findsOneWidget);
        expect(
          find.textContaining('1 waiting for school approval'),
          findsOneWidget,
        );
        expect(find.text('By Grace Okafor'), findsOneWidget);
        expect(find.textContaining('released by Sam Gate'), findsOneWidget);
      },
    );

    testWidgets('editing from the detail page sends only the change', (
      tester,
    ) async {
      final g = await openPupils(tester, {
        'GET /pupils/1': (200, pupilJson()),
        'PATCH /pupils/1': (200, pupilJson(last: 'Obi')),
      });

      await tester.tap(find.text('Chidi Eze'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit pupil'));
      await tester.pumpAndSettle();
      expect(find.text('Choose the parent'), findsNothing);
      await type(tester, 'Last name', 'Obi');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(g.backend.bodies['PATCH /pupils/1'], {'last_name': 'Obi'});
      expect(find.text('Chidi Obi'), findsWidgets);
      expect(find.text('Saved changes to Chidi Obi.'), findsOneWidget);
    });

    testWidgets('back arrows lead up the stack', (tester) async {
      await openPupils(tester, {'GET /pupils/1': (200, pupilJson())});

      await tester.tap(find.text('Chidi Eze'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('2 pupils'), findsOneWidget);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Account'), findsOneWidget); // the More menu
    });
  });
}
