import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/photo_picker.dart';
import 'package:pikva/features/pickers/data/picker_repository.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

void main() {
  group('photoProblem', () {
    test('accepts JPEG, PNG and WebP in any case', () {
      for (final n in ['a.jpg', 'a.JPEG', 'a.png', 'A.PNG', 'a.webp']) {
        expect(photoProblem(jpegPhoto(name: n)), isNull, reason: n);
      }
    });

    test('rejects other types', () {
      for (final n in ['a.gif', 'a.heic', 'a.pdf', 'photo']) {
        expect(
          photoProblem(jpegPhoto(name: n)),
          'Choose a JPEG, PNG or WebP photo.',
          reason: n,
        );
      }
    });

    test('rejects photos over 5 MB but not exactly 5 MB', () {
      const five = 5 * 1024 * 1024;
      expect(photoProblem(jpegPhoto(size: five)), isNull);
      expect(
        photoProblem(jpegPhoto(size: five + 1)),
        'The photo must be 5 MB or smaller.',
      );
    });
  });

  group('PickerRepository photos', () {
    test('setPhoto PUTs multipart form data with a "photo" file', () async {
      final backend = FakeBackend({
        'PUT /pickers/10/photo': (200, pickerJson()),
      });
      await PickerRepository(apiFor(backend))
          .setPhoto(10, jpegPhoto(name: 'me.png', size: 9));

      final form = backend.bodies['PUT /pickers/10/photo'] as FormData;
      expect(form.files, hasLength(1));
      expect(form.files.single.key, 'photo');
      expect(form.files.single.value.filename, 'me.png');
      expect(form.files.single.value.length, 9);
      expect(form.fields, isEmpty);
    });

    test('removePhoto DELETEs and returns the person', () async {
      final backend = FakeBackend({
        'DELETE /pickers/10/photo': (200, pickerJson()),
      });
      final p = await PickerRepository(apiFor(backend)).removePhoto(10);
      expect(p.id, 10);
      expect(backend.count('DELETE /pickers/10/photo'), 1);
    });
  });

  group('photo in the form', () {
    Future<void> openPeople(WidgetTester tester, dynamic a) async {
      tester.view.physicalSize = const Size(800, 2800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pickup people').last);
      await tester.pumpAndSettle();
    }

    Future<void> type(WidgetTester tester, String label, String text) =>
        tester.enterText(find.widgetWithText(TextField, label), text);

    Future<void> fillNewPerson(WidgetTester tester) async {
      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pupil'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chidi Eze').last);
      await tester.pumpAndSettle();
      await type(tester, 'Full name', 'Tunde Bello');
      await type(tester, 'Phone number', '08033334444');
      await type(tester, 'Relationship to pupil', 'Driver');
      await tester.tap(find.widgetWithText(InkWell, 'Until'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    }

    final created = pickerJson(
      id: 20,
      name: 'Tunde Bello',
      status: 'pending_approval',
    );
    final withPhoto = pickerJson(
      id: 20,
      name: 'Tunde Bello',
      status: 'pending_approval',
      photoUpdatedAt: '2026-11-12T10:00:00Z',
    );

    testWidgets('a new person is saved, then their photo is uploaded', (
      tester,
    ) async {
      final picker = FakePhotoPicker(result: jpegPhoto());
      final a = parentApp({
        'GET /pickers': (200, []),
        'POST /pickers': (201, created),
        'PUT /pickers/20/photo': (200, withPhoto),
      }, photoPicker: picker);
      await openPeople(tester, a);
      await fillNewPerson(tester);

      await tester.tap(find.text('Choose photo'));
      await tester.pumpAndSettle();
      expect(picker.requested, [PhotoSource.gallery]);
      expect(find.textContaining('This photo will be saved'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Add person'));
      await tester.pumpAndSettle();

      expect(a.backend.count('POST /pickers'), 1);
      expect(a.backend.count('PUT /pickers/20/photo'), 1);
      final form = a.backend.bodies['PUT /pickers/20/photo'] as FormData;
      expect(form.files.single.key, 'photo');
      expect(find.text('Add pickup person'), findsNothing);
      expect(find.text('Tunde Bello'), findsOneWidget);
    });

    testWidgets('Take photo uses the camera', (tester) async {
      final picker = FakePhotoPicker(result: jpegPhoto());
      final a = parentApp({'GET /pickers': (200, [])}, photoPicker: picker);
      await openPeople(tester, a);
      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Take photo'));
      await tester.pumpAndSettle();

      expect(picker.requested, [PhotoSource.camera]);
    });

    testWidgets('cancelling the picker changes nothing', (tester) async {
      final picker = FakePhotoPicker(); // result null = cancelled
      final a = parentApp({'GET /pickers': (200, [])}, photoPicker: picker);
      await openPeople(tester, a);
      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Choose photo'));
      await tester.pumpAndSettle();

      expect(find.textContaining('This photo will be saved'), findsNothing);
      expect(find.textContaining('Optional. JPEG'), findsOneWidget);
    });

    testWidgets('a wrong file type is refused before saving', (tester) async {
      final picker = FakePhotoPicker(result: jpegPhoto(name: 'face.gif'));
      final a = parentApp({'GET /pickers': (200, [])}, photoPicker: picker);
      await openPeople(tester, a);
      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Choose photo'));
      await tester.pumpAndSettle();

      expect(find.text('Choose a JPEG, PNG or WebP photo.'), findsOneWidget);
      expect(find.textContaining('This photo will be saved'), findsNothing);
    });

    testWidgets('a denied camera shows a helpful message', (tester) async {
      final picker = FakePhotoPicker(error: Exception('camera_access_denied'));
      final a = parentApp({'GET /pickers': (200, [])}, photoPicker: picker);
      await openPeople(tester, a);
      await tester.tap(find.text('Add person'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Take photo'));
      await tester.pumpAndSettle();

      expect(
        find.text('Could not open the camera. Check that Pikva may use it.'),
        findsOneWidget,
      );
    });

    testWidgets(
      'if the upload fails the details stay saved and a retry does not duplicate them',
      (tester) async {
        final picker = FakePhotoPicker(result: jpegPhoto());
        final a = parentApp({
          'GET /pickers': (200, []),
          'POST /pickers': (201, created),
          'PUT /pickers/20/photo': (
            413,
            {'detail': 'The photo must be 5 MB or smaller'},
          ),
        }, photoPicker: picker);
        await openPeople(tester, a);
        await fillNewPerson(tester);
        await tester.tap(find.text('Choose photo'));
        await tester.pumpAndSettle();

        await tester.tap(find.widgetWithText(FilledButton, 'Add person'));
        await tester.pumpAndSettle();

        expect(
          find.textContaining(
            "details were saved, but the photo was not uploaded: "
            'The photo must be 5 MB or smaller',
          ),
          findsOneWidget,
        );
        // Still on the form, now editing the saved person.
        expect(find.text('Edit pickup person'), findsOneWidget);
        expect(find.text('Pupil'), findsNothing);
        // The list behind already has them.
        expect(find.text('Tunde Bello', skipOffstage: false), findsWidgets);

        // Retry with a server that now accepts the photo.
        // The fake server does not echo the typed times, so the retry may also
        // PATCH those; a real server returns what was sent.
        a.backend.routes['PATCH /pickers/20'] = (200, created);
        a.backend.routes['PUT /pickers/20/photo'] = (200, withPhoto);
        await tester.tap(find.widgetWithText(FilledButton, 'Save changes'));
        await tester.pumpAndSettle();

        expect(a.backend.count('POST /pickers'), 1);
        expect(a.backend.count('PUT /pickers/20/photo'), 2);
        expect(find.text('Edit pickup person'), findsNothing);
      },
    );

    testWidgets(
      'replacing a photo on an existing person sends only the photo',
      (tester) async {
        final picker = FakePhotoPicker(result: jpegPhoto());
        final a = parentApp({
          'GET /pickers': (
            200,
            [pickerJson(photoUpdatedAt: '2026-11-01T10:00:00Z')],
          ),
          'PUT /pickers/10/photo': (
            200,
            pickerJson(
              status: 'pending_approval',
              photoUpdatedAt: '2026-11-12T10:00:00Z',
            ),
          ),
        }, photoPicker: picker);
        await openPeople(tester, a);

        await tester.tap(find.text('Edit'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Choose photo'));
        await tester.pumpAndSettle();
        expect(find.text('Keep current photo'), findsOneWidget);
        await tester.tap(find.text('Save changes'));
        await tester.pumpAndSettle();

        expect(a.backend.count('PATCH /pickers/10'), 0);
        expect(a.backend.count('PUT /pickers/10/photo'), 1);
        expect(find.text('Awaiting approval'), findsOneWidget);
      },
    );

    testWidgets('removing a photo calls DELETE and can be undone first', (
      tester,
    ) async {
      final a = parentApp({
        'GET /pickers': (
          200,
          [pickerJson(photoUpdatedAt: '2026-11-01T10:00:00Z')],
        ),
        'DELETE /pickers/10/photo': (200, pickerJson()),
      });
      await openPeople(tester, a);

      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove photo'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('will be removed when you save'),
        findsOneWidget,
      );

      await tester.tap(find.text('Keep photo'));
      await tester.pumpAndSettle();
      expect(find.text('Remove photo'), findsOneWidget);

      await tester.tap(find.text('Remove photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(a.backend.count('DELETE /pickers/10/photo'), 1);
      expect(a.backend.count('PATCH /pickers/10'), 0);
      expect(find.text('Edit pickup person'), findsNothing);
    });

    testWidgets('a person with no photo has no Remove button', (tester) async {
      final a = parentApp({
        'GET /pickers': (200, [pickerJson()]),
      });
      await openPeople(tester, a);

      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();

      expect(find.text('Remove photo'), findsNothing);
    });
  });
}
