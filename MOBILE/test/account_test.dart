import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/account/domain/account_rules.dart';
import 'package:pikva/features/auth/domain/current_user.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

const _user = CurrentUser(
  id: 7,
  schoolId: 1,
  name: 'Ada Eze',
  email: 'a@example.com',
  phone: '08000000000',
  role: UserRole.parent,
  schoolName: 'Sunrise School',
);

void main() {
  group('ownDetailsChanges', () {
    test('only changed fields are sent, trimmed', () {
      final r = ownDetailsChanges(
        _user,
        name: ' Ada Obi ',
        phone: '08000000000',
      );
      expect(r.body, {'name': 'Ada Obi'});
    });

    test('nothing changed gives an empty body', () {
      final r = ownDetailsChanges(
        _user,
        name: 'Ada Eze',
        phone: ' 08000000000',
      );
      expect(r.isOk, isTrue);
      expect(r.body, isEmpty);
    });

    test('rejects blanks and over-long values', () {
      expect(
        ownDetailsChanges(_user, name: ' ', phone: '1').error,
        'Enter your full name.',
      );
      expect(
        ownDetailsChanges(_user, name: 'x' * 151, phone: '1').error,
        'Your name can be at most 150 characters.',
      );
      expect(
        ownDetailsChanges(_user, name: 'A', phone: '').error,
        'Enter your phone number.',
      );
      expect(
        ownDetailsChanges(_user, name: 'A', phone: '1' * 31).error,
        'The phone number can be at most 30 characters.',
      );
    });
  });

  group('passwordProblem', () {
    String? check(String c, String n, String m) =>
        passwordProblem(current: c, next: n, confirm: m)?.error;

    test('accepts a valid change', () {
      expect(check('old-pass', 'new-pass', 'new-pass'), isNull);
    });

    test('same messages as the web app', () {
      expect(check('', 'n', 'n'), 'Enter your current password.');
      expect(check('o', '   ', '   '), 'Enter a new password.');
      expect(
        check('o', 'x' * 129, 'x' * 129),
        'The new password can be at most 128 characters.',
      );
      expect(
        check('same', 'same', 'same'),
        'The new password must be different from your current one.',
      );
      expect(check('o', 'new', 'other'), 'The two new passwords do not match.');
    });
  });

  group('account screen', () {
    Future<dynamic> openAccount(
      WidgetTester tester, {
      Map<String, (int, Object)> routes = const {},
    }) async {
      // Tall enough that nothing on the screen needs scrolling.
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp(routes);
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Account'));
      await tester.pumpAndSettle();
      return a;
    }

    Future<void> type(WidgetTester tester, String label, String text) =>
        tester.enterText(find.widgetWithText(TextField, label), text);

    testWidgets('shows the details', (tester) async {
      await openAccount(tester);

      expect(find.text('Ada Eze'), findsOneWidget);
      expect(find.text('a@example.com'), findsOneWidget);
      expect(find.text('08000000000'), findsOneWidget);
      expect(find.text('Sunrise School'), findsOneWidget);
    });

    testWidgets(
      'editing details sends only the change and updates the screen',
      (tester) async {
        final a = await openAccount(
          tester,
          routes: {
            'PATCH /auth/me': (
              200,
              {
                'id': 7,
                'school_id': 1,
                'name': 'Ada Obi',
                'email': 'a@example.com',
                'phone': '08000000000',
                'role': 'parent',
                'school_name': 'Sunrise School',
              },
            ),
          },
        );

        await tester.tap(find.text('Edit details'));
        await tester.pumpAndSettle();
        await type(tester, 'Full name', 'Ada Obi');
        await tester.tap(find.text('Save changes'));
        await tester.pumpAndSettle();

        expect(a.backend.bodies['PATCH /auth/me'], {'name': 'Ada Obi'});
        expect(find.text('Ada Obi'), findsOneWidget);
        expect(find.text('Your details were saved.'), findsOneWidget);
      },
    );

    testWidgets('saving unchanged details sends nothing', (tester) async {
      final a = await openAccount(tester);

      await tester.tap(find.text('Edit details'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(a.backend.count('PATCH /auth/me'), 0);
      expect(find.text('Your details'), findsOneWidget); // back on Account
    });

    testWidgets('a refused edit shows the message', (tester) async {
      await openAccount(
        tester,
        routes: {
          'PATCH /auth/me': (422, {'detail': 'Name is not allowed'}),
        },
      );

      await tester.tap(find.text('Edit details'));
      await tester.pumpAndSettle();
      await type(tester, 'Full name', 'Ada Obi');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(find.text('Name is not allowed'), findsOneWidget);
    });

    testWidgets('changing the password keeps this device signed in', (
      tester,
    ) async {
      final a = await openAccount(
        tester,
        routes: {
          'POST /auth/change-password': (
            200,
            {'access_token': 'fresh', 'token_type': 'bearer'},
          ),
        },
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
      await tester.pumpAndSettle();
      await type(tester, 'Current password', 'old-pass');
      await type(tester, 'New password', 'new-pass');
      await type(tester, 'Confirm new password', 'new-pass');
      await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
      await tester.pumpAndSettle();

      expect(a.backend.bodies['POST /auth/change-password'], {
        'current_password': 'old-pass',
        'new_password': 'new-pass',
      });
      expect(
        find.text(
          'Password changed. You have been signed out on your other devices.',
        ),
        findsOneWidget,
      );
      // Still signed in, on the Account screen.
      expect(find.text('Your details'), findsOneWidget);
    });

    testWidgets('mismatched passwords are caught before sending', (
      tester,
    ) async {
      final a = await openAccount(tester);

      await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
      await tester.pumpAndSettle();
      await type(tester, 'Current password', 'old-pass');
      await type(tester, 'New password', 'new-pass');
      await type(tester, 'Confirm new password', 'different');
      await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
      await tester.pumpAndSettle();

      expect(find.text('The two new passwords do not match.'), findsOneWidget);
      expect(a.backend.count('POST /auth/change-password'), 0);
    });

    testWidgets('a wrong current password shows the server message', (
      tester,
    ) async {
      await openAccount(
        tester,
        routes: {
          'POST /auth/change-password': (
            400,
            {'detail': 'Current password is incorrect'},
          ),
        },
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
      await tester.pumpAndSettle();
      await type(tester, 'Current password', 'wrong');
      await type(tester, 'New password', 'new-pass');
      await type(tester, 'Confirm new password', 'new-pass');
      await tester.tap(find.widgetWithText(FilledButton, 'Change password'));
      await tester.pumpAndSettle();

      expect(find.text('Current password is incorrect'), findsOneWidget);
    });

    testWidgets('the reset link is requested for the signed-in email', (
      tester,
    ) async {
      final a = await openAccount(
        tester,
        routes: {
          'POST /auth/password-reset/request': (
            202,
            {'detail': 'If an account exists, we have sent a link.'},
          ),
        },
      );

      await tester.tap(find.text('Forgot your password? Email me a link'));
      await tester.pumpAndSettle();
      expect(find.textContaining('a@example.com'), findsWidgets);
      await tester.tap(find.text('Send link'));
      await tester.pumpAndSettle();

      expect(a.backend.bodies['POST /auth/password-reset/request'], {
        'email': 'a@example.com',
      });
      expect(
        find.text('If an account exists, we have sent a link.'),
        findsOneWidget,
      );
    });

    testWidgets('sign out asks first, and cancel stays signed in', (
      tester,
    ) async {
      await openAccount(tester);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Sign out'));
      await tester.pumpAndSettle();
      expect(find.text('Sign out?'), findsOneWidget);

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(find.text('Sign out?'), findsNothing);
      expect(find.text('Your details'), findsOneWidget);
    });
  });
}
