import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:pikva/core/qr_scanner.dart';
import 'package:pikva/features/gate/data/gate_repository.dart';
import 'package:pikva/features/gate/domain/gate.dart';
import 'package:pikva/main.dart';
import 'package:pikva/shared/format.dart';

import 'support/fakes.dart';

Map<String, dynamic> verifyJson({
  String result = 'valid',
  bool withPeople = true,
  String? pickerPhotoUpdatedAt,
}) => {
  'result': result,
  'method': 'manual',
  'verified': result == 'valid',
  'pupil': withPeople
      ? {'id': 1, 'first_name': 'Chidi', 'last_name': 'Eze', 'photo_url': null}
      : null,
  'authorisation': withPeople
      ? {
          'id': 10,
          'picker_name': 'Grace Okafor',
          'relationship': 'Aunt',
          'photo_updated_at': pickerPhotoUpdatedAt,
        }
      : null,
  'code_expires_at': '2026-11-12T20:00:00Z',
};

Map<String, dynamic> releaseJson({
  String result = 'valid',
  String? at = '2026-11-12T14:30:00Z',
}) => {
  'result': result,
  'method': 'manual',
  'released': result == 'valid',
  'release_id': result == 'valid' ? 5 : null,
  'released_at': at,
};

void main() {
  group('normaliseCode', () {
    test('tidies spaces, dashes and case', () {
      expect(normaliseCode(' abcd-2345 ').code, 'ABCD2345');
      expect(normaliseCode('ABCD 2345').code, 'ABCD2345');
    });

    test('says what is wrong', () {
      expect(normaliseCode('').error, 'Enter the pickup code.');
      expect(normaliseCode('   ').error, 'Enter the pickup code.');
      expect(
        normaliseCode('ABCD234').error,
        'Codes are 8 characters long. Check the code and try again.',
      );
      expect(
        normaliseCode('ABCD23456').error,
        'Codes are 8 characters long. Check the code and try again.',
      );
    });

    test('rejects the characters codes never use: 0, 1, I and O', () {
      for (final bad in ['0BCD2345', '1BCD2345', 'IBCD2345', 'OBCD2345']) {
        expect(
          normaliseCode(bad).error,
          startsWith('Codes use letters and numbers only'),
          reason: bad,
        );
      }
    });
  });

  group('parseQrData', () {
    const good = '{"code":"ABCD2345","code_date":"2026-11-12"}';

    test('accepts a Pikva QR and returns it unchanged', () {
      expect(parseQrData(good).qrData, good);
    });

    test('rejects anything else', () {
      for (final bad in [
        'https://example.com',
        'not json',
        '{}',
        '{"code":123}',
        '{"code":"0BCD2345"}',
        '{"code":"SHORT"}',
        '[1,2]',
        '{"code":"ABCD2345","pad":"${'x' * 600}"}',
      ]) {
        final r = parseQrData(bad);
        expect(r.qrData, isNull, reason: bad);
        expect(r.error, notAPickupQr, reason: bad);
      }
    });
  });

  group('models', () {
    test('every failed result has its own words', () {
      for (final r in CheckResult.values) {
        if (r == CheckResult.valid) continue;
        expect(failureText(r).title, isNotEmpty, reason: '$r');
      }
      expect(failureText(CheckResult.usedCode).title, 'Code already used');
      expect(failureText(CheckResult.unknown).title, 'Check failed');
    });

    test('an unknown result from a newer backend never passes', () {
      expect(CheckResult.parse('something_new'), CheckResult.unknown);
      expect(CheckResult.parse(null), CheckResult.unknown);
    });

    test('verified needs a valid result AND who it is for', () {
      expect(VerifyOutcome.fromJson(verifyJson()).verified, isTrue);
      expect(
        VerifyOutcome.fromJson(verifyJson(withPeople: false)).verified,
        isFalse,
      );
      expect(
        VerifyOutcome.fromJson(
          verifyJson(result: 'used_code', withPeople: false),
        ).verified,
        isFalse,
      );
    });

    test('released needs a valid result AND a time', () {
      expect(ReleaseOutcome.fromJson(releaseJson()).released, isTrue);
      expect(ReleaseOutcome.fromJson(releaseJson(at: null)).released, isFalse);
      expect(
        ReleaseOutcome.fromJson(releaseJson(result: 'used_code')).released,
        isFalse,
      );
    });

    test('requests carry the method and only its own input', () {
      expect(const GateRequest.manual('ABCD2345').toJson(), {
        'method': 'manual',
        'code': 'ABCD2345',
      });
      expect(const GateRequest.qr('{"code":"X"}').toJson(), {
        'method': 'qr',
        'qr_data': '{"code":"X"}',
      });
    });
  });

  group('GateRepository', () {
    test('verify, refuse and release post the request to /pickup/*', () async {
      final backend = FakeBackend({
        'POST /pickup/verify': (200, verifyJson()),
        'POST /pickup/refuse': (200, {'result': 'valid', 'refused': true}),
        'POST /pickup/release': (201, releaseJson()),
      });
      final repo = GateRepository(apiFor(backend));
      const req = GateRequest.manual('ABCD2345');

      expect((await repo.verify(req)).verified, isTrue);
      expect((await repo.refuse(req)).refused, isTrue);
      expect((await repo.release(req)).released, isTrue);

      for (final k in [
        'POST /pickup/verify',
        'POST /pickup/refuse',
        'POST /pickup/release',
      ]) {
        expect(backend.bodies[k], {'method': 'manual', 'code': 'ABCD2345'});
      }
    });

    test('a pupil with no uploaded photo gives null, not an error', () async {
      final repo = GateRepository(apiFor(FakeBackend()));
      expect(
        await repo.pupilPhoto(
          const GatePupil(id: 1, firstName: 'A', lastName: 'B'),
        ),
        isNull,
      );
    });
  });

  group('gate screen', () {
    Future<({FakeBackend backend})> openGate(
      WidgetTester tester,
      Map<String, (int, Object)> routes, {
      FakeQrScanner? scanner,
    }) async {
      tester.view.physicalSize = const Size(800, 2000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp(routes, role: 'gate_staff', scanner: scanner);
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    Future<void> enterAndCheck(WidgetTester tester, String code) async {
      await tester.enterText(find.byType(TextField), code);
      await tester.tap(find.widgetWithText(FilledButton, 'Check code'));
      await tester.pumpAndSettle();
    }

    testWidgets('gate staff land on the gate with Gate and Account tabs', (
      tester,
    ) async {
      await openGate(tester, {});

      expect(find.text('Check a pickup code'), findsOneWidget);
      expect(
        find.widgetWithText(NavigationDestination, 'Gate'),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(NavigationDestination, 'Account'),
        findsOneWidget,
      );
    });

    testWidgets('a mistyped code is caught without asking the server', (
      tester,
    ) async {
      final g = await openGate(tester, {});

      await enterAndCheck(tester, 'ABCD 234O');

      expect(find.textContaining('never 0, 1, I or O'), findsOneWidget);
      expect(g.backend.count('POST /pickup/verify'), 0);
    });

    testWidgets('verify, release, then on to the next pickup', (tester) async {
      final g = await openGate(tester, {
        'POST /pickup/verify': (200, verifyJson()),
        'POST /pickup/release': (201, releaseJson()),
      });

      await enterAndCheck(tester, 'abcd 2345');

      expect(g.backend.bodies['POST /pickup/verify'], {
        'method': 'manual',
        'code': 'ABCD2345',
      });
      expect(find.text('Code valid'), findsOneWidget);
      expect(find.text('Chidi Eze'), findsOneWidget);
      expect(find.text('Grace Okafor'), findsOneWidget);
      expect(find.text('Aunt'), findsOneWidget);
      // No photos in this fixture, so both are flagged.
      expect(find.textContaining('No photo'), findsNWidgets(2));
      expect(g.backend.count('POST /pickup/release'), 0);

      await tester.tap(find.text('Release Chidi'));
      await tester.pumpAndSettle();

      expect(g.backend.bodies['POST /pickup/release'], {
        'method': 'manual',
        'code': 'ABCD2345',
      });
      expect(find.text('Chidi released'), findsOneWidget);
      final time = formatTime(DateTime.parse('2026-11-12T14:30:00Z'));
      expect(
        find.text('To Grace Okafor at $time. The release has been recorded.'),
        findsOneWidget,
      );

      await tester.tap(find.text('Next pickup'));
      await tester.pumpAndSettle();
      expect(find.text('Check a pickup code'), findsOneWidget);
    });

    testWidgets('a failed check says why and never offers to release', (
      tester,
    ) async {
      final g = await openGate(tester, {
        'POST /pickup/verify': (
          200,
          verifyJson(result: 'used_code', withPeople: false),
        ),
      });

      await enterAndCheck(tester, 'ABCD2345');

      expect(find.text('Do not release'.toUpperCase()), findsOneWidget);
      expect(find.text('Code already used'), findsOneWidget);
      expect(
        find.textContaining('recorded as a security alert'),
        findsOneWidget,
      );
      expect(find.textContaining('Release'), findsNothing);
      expect(g.backend.count('POST /pickup/release'), 0);

      await tester.tap(find.text('Next pickup'));
      await tester.pumpAndSettle();
      expect(find.text('Check a pickup code'), findsOneWidget);
    });

    testWidgets('a valid result without who it is for is not a pass', (
      tester,
    ) async {
      await openGate(tester, {
        'POST /pickup/verify': (200, verifyJson(withPeople: false)),
      });

      await enterAndCheck(tester, 'ABCD2345');

      expect(find.text('Check failed'), findsOneWidget);
      expect(find.text('Code valid'), findsNothing);
    });

    testWidgets('release can fail if the code was used since the check', (
      tester,
    ) async {
      await openGate(tester, {
        'POST /pickup/verify': (200, verifyJson()),
        'POST /pickup/release': (
          200,
          releaseJson(result: 'used_code', at: null),
        ),
      });

      await enterAndCheck(tester, 'ABCD2345');
      await tester.tap(find.text('Release Chidi'));
      await tester.pumpAndSettle();

      expect(find.text('Code already used'), findsOneWidget);
      expect(find.text('Chidi released'), findsNothing);
    });

    testWidgets('refusing asks first, then cancels the code', (tester) async {
      final g = await openGate(tester, {
        'POST /pickup/verify': (200, verifyJson()),
        'POST /pickup/refuse': (200, {'result': 'valid', 'refused': true}),
      });

      await enterAndCheck(tester, 'ABCD2345');
      await tester.tap(find.textContaining("Don't release"));
      await tester.pumpAndSettle();
      expect(find.textContaining('Refuse this pickup?'), findsOneWidget);
      expect(g.backend.count('POST /pickup/refuse'), 0);

      // Backing out returns to the release button.
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Release Chidi'), findsOneWidget);

      await tester.tap(find.textContaining("Don't release"));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Refuse pickup'));
      await tester.pumpAndSettle();

      expect(g.backend.count('POST /pickup/refuse'), 1);
      expect(find.text('Pickup refused'), findsOneWidget);
      expect(find.textContaining('Chidi stays at school'), findsOneWidget);
      expect(g.backend.count('POST /pickup/release'), 0);
    });

    testWidgets('a refusal that no longer applies shows the reason', (
      tester,
    ) async {
      await openGate(tester, {
        'POST /pickup/verify': (200, verifyJson()),
        'POST /pickup/refuse': (200, {'result': 'used_code', 'refused': false}),
      });

      await enterAndCheck(tester, 'ABCD2345');
      await tester.tap(find.textContaining("Don't release"));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Refuse pickup'));
      await tester.pumpAndSettle();

      expect(find.text('Code already used'), findsOneWidget);
      expect(find.text('Pickup refused'), findsNothing);
    });

    testWidgets('a server problem stays on the entry with the message', (
      tester,
    ) async {
      await openGate(tester, {
        'POST /pickup/verify': (429, {'detail': 'Too many gate checks'}),
      });

      await enterAndCheck(tester, 'ABCD2345');

      expect(find.text('Too many gate checks'), findsOneWidget);
      expect(find.text('Check a pickup code'), findsOneWidget);
    });

    testWidgets('a release that cannot be sent keeps the person on screen', (
      tester,
    ) async {
      final g = await openGate(tester, {
        'POST /pickup/verify': (200, verifyJson()),
        'POST /pickup/release': (500, {'detail': 'boom'}),
      });

      await enterAndCheck(tester, 'ABCD2345');
      await tester.tap(find.text('Release Chidi'));
      await tester.pumpAndSettle();

      expect(find.text('Code valid'), findsOneWidget);
      expect(find.textContaining('server had a problem'), findsOneWidget);
      expect(g.backend.count('POST /pickup/release'), 1);

      // Staff can try again.
      g.backend.routes['POST /pickup/release'] = (201, releaseJson());
      await tester.tap(find.text('Release Chidi'));
      await tester.pumpAndSettle();
      expect(find.text('Chidi released'), findsOneWidget);
    });

    group('QR scanning', () {
      const goodQr =
          '{"code":"ABCD2345","code_date":"2026-11-12","expires_at":"2026-11-12T20:00:00Z"}';

      testWidgets('Scan QR code opens the camera view, Cancel closes it', (
        tester,
      ) async {
        await openGate(tester, {}, scanner: FakeQrScanner());

        await tester.tap(find.text('Scan QR code'));
        await tester.pumpAndSettle();
        expect(find.text('Scan the QR code'), findsOneWidget);
        expect(find.text('Pretend scan'), findsOneWidget);

        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(find.text('Check a pickup code'), findsOneWidget);
      });

      testWidgets('a scanned pickup QR is verified as a QR check', (
        tester,
      ) async {
        final g = await openGate(tester, {
          'POST /pickup/verify': (200, verifyJson()),
          'POST /pickup/release': (201, releaseJson()),
        }, scanner: FakeQrScanner(text: goodQr));

        await tester.tap(find.text('Scan QR code'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Pretend scan'));
        await tester.pumpAndSettle();

        expect(g.backend.bodies['POST /pickup/verify'], {
          'method': 'qr',
          'qr_data': goodQr,
        });
        expect(find.text('Code valid'), findsOneWidget);

        await tester.tap(find.text('Release Chidi'));
        await tester.pumpAndSettle();
        expect(g.backend.bodies['POST /pickup/release'], {
          'method': 'qr',
          'qr_data': goodQr,
        });
        expect(find.text('Chidi released'), findsOneWidget);
      });

      testWidgets('some other QR code is refused without asking the server', (
        tester,
      ) async {
        final g = await openGate(
          tester,
          {},
          scanner: FakeQrScanner(text: 'https://example.com/menu'),
        );

        await tester.tap(find.text('Scan QR code'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Pretend scan'));
        await tester.pumpAndSettle();

        expect(find.text(notAPickupQr), findsOneWidget);
        expect(g.backend.count('POST /pickup/verify'), 0);
        expect(find.text('Check a pickup code'), findsOneWidget);
      });

      testWidgets('a camera problem returns to typing with the reason', (
        tester,
      ) async {
        await openGate(
          tester,
          {},
          scanner: FakeQrScanner(errorMessage: 'Camera access is blocked.'),
        );

        await tester.tap(find.text('Scan QR code'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Pretend camera error'));
        await tester.pumpAndSettle();

        expect(find.text('Camera access is blocked.'), findsOneWidget);
        expect(find.text('Check a pickup code'), findsOneWidget);
      });

      test('camera errors have clear words', () {
        expect(
          cameraErrorText(MobileScannerErrorCode.permissionDenied),
          contains('Allow the camera'),
        );
        expect(
          cameraErrorText(MobileScannerErrorCode.unsupported),
          contains('No camera was found'),
        );
        expect(
          cameraErrorText(MobileScannerErrorCode.genericError),
          contains('could not start'),
        );
      });
    });

    testWidgets('the Account tab is there for sign out', (tester) async {
      await openGate(tester, {});

      await tester.tap(find.widgetWithText(NavigationDestination, 'Account'));
      await tester.pumpAndSettle();

      expect(find.text('Your details'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Sign out'), findsOneWidget);
    });
  });
}
