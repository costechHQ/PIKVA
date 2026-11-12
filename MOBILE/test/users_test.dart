import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/users/data/user_repository.dart';
import 'package:pikva/features/admin/users/domain/school_user.dart';
import 'package:pikva/main.dart';
import 'package:pikva/shared/form_result.dart';

import 'support/fakes.dart';

Map<String, dynamic> userJson({
  int id = 20,
  String name = 'Bayo Adeyemi',
  String email = 'bayo@example.com',
  String phone = '07000000000',
  String role = 'parent',
  bool isActive = true,
}) => {
  'id': id,
  'school_id': 1,
  'name': name,
  'email': email,
  'phone': phone,
  'role': role,
  'is_active': isActive,
};

void main() {
  final bayo = SchoolUser.fromJson(userJson());

  group('SchoolUser', () {
    test('parses and labels roles', () {
      expect(bayo.roleLabel, 'Parent');
      expect(
        SchoolUser.fromJson(userJson(role: 'gate_staff')).roleLabel,
        'Gate staff',
      );
      expect(
        SchoolUser.fromJson(userJson(role: 'school_admin')).roleLabel,
        'Admin',
      );
    });

    test('only parents and gate staff are manageable', () {
      expect(bayo.isManageable, isTrue);
      expect(
        SchoolUser.fromJson(userJson(role: 'gate_staff')).isManageable,
        isTrue,
      );
      expect(
        SchoolUser.fromJson(userJson(role: 'school_admin')).isManageable,
        isFalse,
      );
      expect(
        SchoolUser.fromJson(userJson(role: 'mystery')).isManageable,
        isFalse,
      );
      expect(SchoolUser.fromJson(userJson(role: 'mystery')).role, isNull);
    });

    test('role filters map to the role query', () {
      expect(RoleFilter.all.query, isNull);
      expect(RoleFilter.parents.query, 'parent');
      expect(RoleFilter.gateStaff.query, 'gate_staff');
      expect(RoleFilter.admins.query, 'school_admin');
    });
  });

  group('newUserBody', () {
    FormResult build({
      CreatableRole? role = CreatableRole.parent,
      String name = ' Bayo Adeyemi ',
      String email = ' bayo@example.com ',
      String phone = ' 07000000000 ',
    }) => newUserBody(role: role, name: name, email: email, phone: phone);

    test('builds a trimmed body with the role', () {
      expect(build().body, {
        'name': 'Bayo Adeyemi',
        'email': 'bayo@example.com',
        'phone': '07000000000',
        'role': 'parent',
      });
      expect(build(role: CreatableRole.gateStaff).body!['role'], 'gate_staff');
    });

    test('says what is wrong, in order', () {
      expect(
        build(role: null).error,
        'Choose whether this is a parent or gate staff.',
      );
      expect(build(name: ' ').error, "Enter the person's full name.");
      expect(
        build(name: 'x' * 151).error,
        'The name can be at most 150 characters.',
      );
      expect(
        build(email: 'not-an-email').error,
        'Enter a valid email address. The set-password link is sent there.',
      );
      expect(
        build(email: 'a@b').error,
        'Enter a valid email address. The set-password link is sent there.',
      );
      expect(build(phone: '').error, "Enter the person's phone number.");
      expect(
        build(phone: '1' * 31).error,
        'The phone number can be at most 30 characters.',
      );
    });
  });

  group('userChanges', () {
    test('only changed fields, and nothing when untouched', () {
      expect(
        userChanges(
          bayo,
          name: 'Bayo Adeyemi',
          email: 'bayo@example.com',
          phone: '07000000000',
        ).body,
        isEmpty,
      );
      expect(
        userChanges(
          bayo,
          name: ' Bayo A ',
          email: 'bayo@example.com',
          phone: '07000000000',
        ).body,
        {'name': 'Bayo A'},
      );
      expect(
        userChanges(
          bayo,
          name: 'Bayo Adeyemi',
          email: 'new@example.com',
          phone: '08011112222',
        ).body,
        {'email': 'new@example.com', 'phone': '08011112222'},
      );
    });

    test('still validates', () {
      expect(
        userChanges(
          bayo,
          name: '',
          email: 'bayo@example.com',
          phone: '1',
        ).error,
        "Enter the person's full name.",
      );
    });
  });

  test('setupLinkMessage never promises delivery', () {
    expect(
      setupLinkMessage(name: 'Bayo', email: 'b@x.co', sent: true),
      'A set-password link was sent to b@x.co. It works once, for 30 minutes.',
    );
    expect(
      setupLinkMessage(name: 'Bayo', email: 'b@x.co', sent: false),
      startsWith('The set-password link could not be emailed to Bayo.'),
    );
  });

  group('UserRepository', () {
    test('list asks for one extra row with role and search', () async {
      final rows = [for (var i = 0; i < 51; i++) userJson(id: i)];
      final backend = FakeBackend({'GET /schools/users': (200, rows)});
      final page = await UserRepository(apiFor(backend))
          .list(role: RoleFilter.parents, search: '  bayo ', offset: 50);

      expect(page.users, hasLength(50));
      expect(page.hasMore, isTrue);
      final q = backend.queries['GET /schools/users']!;
      expect(q['limit'], 51);
      expect(q['offset'], 50);
      expect(q['role'], 'parent');
      expect(q['q'], 'bayo');
    });

    test('no role and no search send neither', () async {
      final backend = FakeBackend({'GET /schools/users': (200, [])});
      await UserRepository(apiFor(backend)).list();
      final q = backend.queries['GET /schools/users']!;
      expect(q.containsKey('role'), isFalse);
      expect(q.containsKey('q'), isFalse);
    });

    test('create returns the user and whether the email went out', () async {
      final backend = FakeBackend({
        'POST /schools/users': (
          201,
          {...userJson(), 'setup_email_sent': false},
        ),
      });
      final created = await UserRepository(apiFor(backend)).create({'x': 1});
      expect(created.user.name, 'Bayo Adeyemi');
      expect(created.setupEmailSent, isFalse);
    });

    test('update, activate, deactivate and the setup link', () async {
      final backend = FakeBackend({
        'PATCH /schools/users/20': (200, userJson(name: 'New')),
        'POST /schools/users/20/deactivate': (200, userJson(isActive: false)),
        'POST /schools/users/20/activate': (200, userJson()),
        'POST /schools/users/20/setup-email': (200, {'email_sent': true}),
      });
      final repo = UserRepository(apiFor(backend));

      expect((await repo.update(20, {'name': 'New'})).name, 'New');
      expect(backend.bodies['PATCH /schools/users/20'], {'name': 'New'});
      expect((await repo.setActive(20, active: false)).isActive, isFalse);
      expect((await repo.setActive(20, active: true)).isActive, isTrue);
      expect(await repo.sendSetupLink(20), isTrue);
    });
  });

  group('users screen', () {
    Future<({FakeBackend backend})> openUsers(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3000);
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
      await tester.tap(find.text('Users'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    Future<void> type(WidgetTester tester, String label, String text) =>
        tester.enterText(find.widgetWithText(TextField, label), text);

    final people = [
      userJson(),
      userJson(
        id: 21,
        name: 'Sam Gate',
        email: 'sam@example.com',
        role: 'gate_staff',
      ),
      userJson(
        id: 22,
        name: 'Dee Admin',
        email: 'dee@example.com',
        role: 'school_admin',
      ),
      userJson(
        id: 23,
        name: 'Off User',
        email: 'off@example.com',
        isActive: false,
      ),
    ];

    testWidgets('More leads to Users and back', (tester) async {
      await openUsers(tester, {'GET /schools/users': (200, people)});

      expect(find.text('Bayo Adeyemi'), findsOneWidget);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Account'), findsOneWidget); // the More menu
    });

    testWidgets(
      'lists users with roles, and only manageable ones get actions',
      (tester) async {
        await openUsers(tester, {'GET /schools/users': (200, people)});

        expect(find.text('Sam Gate'), findsOneWidget);
        expect(find.text('Parent'), findsWidgets);
        expect(find.text('Gate staff'), findsWidgets);
        expect(find.text('Admin'), findsOneWidget);
        expect(find.text('Deactivated'), findsOneWidget);
        // Three manageable users have Edit; the admin has none.
        expect(find.widgetWithText(OutlinedButton, 'Edit'), findsNWidgets(3));
        // The deactivated one offers Activate, not Send link or Deactivate.
        expect(find.widgetWithText(FilledButton, 'Activate'), findsOneWidget);
        expect(
          find.widgetWithText(OutlinedButton, 'Send link'),
          findsNWidgets(2),
        );
      },
    );

    testWidgets('search and role filter reload the list', (tester) async {
      final g = await openUsers(tester, {'GET /schools/users': (200, people)});

      await tester.enterText(find.byType(TextField).first, 'sam');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(g.backend.queries['GET /schools/users']!['q'], 'sam');

      await tester.tap(find.widgetWithText(ChoiceChip, 'Gate staff'));
      await tester.pumpAndSettle();
      final q = g.backend.queries['GET /schools/users']!;
      expect(q['role'], 'gate_staff');
      expect(q['q'], 'sam');

      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(
        g.backend.queries['GET /schools/users']!.containsKey('q'),
        isFalse,
      );
    });

    testWidgets('no results names the search', (tester) async {
      await openUsers(tester, {'GET /schools/users': (200, [])});
      await tester.enterText(find.byType(TextField).first, 'zzz');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();

      expect(find.text('No users match "zzz".'), findsOneWidget);
    });

    testWidgets('deactivating asks first and warns about parents', (
      tester,
    ) async {
      final g = await openUsers(tester, {
        'GET /schools/users': (200, [userJson()]),
        'POST /schools/users/20/deactivate': (200, userJson(isActive: false)),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Deactivate Bayo Adeyemi?'), findsOneWidget);
      expect(find.textContaining('pickup people and any code'), findsOneWidget);
      expect(g.backend.count('POST /schools/users/20/deactivate'), 0);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Deactivate Bayo Adeyemi?'), findsNothing);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Deactivate'));
      await tester.pumpAndSettle();

      expect(g.backend.count('POST /schools/users/20/deactivate'), 1);
      expect(find.text('Deactivated'), findsOneWidget);
      expect(find.text('Bayo Adeyemi deactivated.'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Activate'), findsOneWidget);
    });

    testWidgets('gate staff get no pickup-people warning', (tester) async {
      await openUsers(tester, {
        'GET /schools/users': (200, [userJson(role: 'gate_staff')]),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Deactivate'));
      await tester.pumpAndSettle();

      expect(find.textContaining('pickup people and any code'), findsNothing);
    });

    testWidgets('activating brings them back', (tester) async {
      await openUsers(tester, {
        'GET /schools/users': (200, [userJson(isActive: false)]),
        'POST /schools/users/20/activate': (200, userJson()),
      });

      await tester.tap(find.widgetWithText(FilledButton, 'Activate'));
      await tester.pumpAndSettle();

      expect(find.text('Deactivated'), findsNothing);
      expect(
        find.text('Bayo Adeyemi activated. They can sign in again.'),
        findsOneWidget,
      );
    });

    testWidgets('Send link reports sent and failed honestly', (tester) async {
      final g = await openUsers(tester, {
        'GET /schools/users': (200, [userJson()]),
        'POST /schools/users/20/setup-email': (200, {'email_sent': true}),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Send link'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'A set-password link was sent to bayo@example.com. It works once, for 30 minutes.',
        ),
        findsOneWidget,
      );

      g.backend.routes['POST /schools/users/20/setup-email'] = (
        200,
        {'email_sent': false},
      );
      await tester.tap(find.widgetWithText(OutlinedButton, 'Send link'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('could not be emailed to Bayo Adeyemi'),
        findsOneWidget,
      );
    });

    testWidgets('a deactivated account cannot be sent a link (409 shown)', (
      tester,
    ) async {
      await openUsers(tester, {
        'GET /schools/users': (200, [userJson()]),
        'POST /schools/users/20/setup-email': (
          409,
          {'detail': 'The account is deactivated'},
        ),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Send link'));
      await tester.pumpAndSettle();

      expect(find.text('The account is deactivated'), findsOneWidget);
    });

    testWidgets('editing sends only what changed', (tester) async {
      final g = await openUsers(tester, {
        'GET /schools/users': (200, [userJson()]),
        'PATCH /schools/users/20': (200, userJson(phone: '08099998888')),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Edit'));
      await tester.pumpAndSettle();
      expect(find.text('Edit user'), findsOneWidget);
      expect(find.text('Role'), findsNothing);
      await type(tester, 'Phone number', '08099998888');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(g.backend.bodies['PATCH /schools/users/20'], {
        'phone': '08099998888',
      });
      expect(find.text('08099998888'), findsOneWidget);
      expect(find.text('Saved changes to Bayo Adeyemi.'), findsOneWidget);
    });

    testWidgets('editing to an email already in use shows the conflict', (
      tester,
    ) async {
      await openUsers(tester, {
        'GET /schools/users': (200, [userJson()]),
        'PATCH /schools/users/20': (
          409,
          {'detail': 'That email address is already in use'},
        ),
      });

      await tester.tap(find.widgetWithText(OutlinedButton, 'Edit'));
      await tester.pumpAndSettle();
      await type(tester, 'Email', 'taken@example.com');
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();

      expect(find.text('That email address is already in use'), findsOneWidget);
      expect(find.text('Edit user'), findsOneWidget);
    });

    testWidgets('adding a user shows the outcome, and Add another resets', (
      tester,
    ) async {
      final g = await openUsers(tester, {
        'GET /schools/users': (200, []),
        'POST /schools/users': (
          201,
          {
            ...userJson(id: 30, name: 'New Parent', email: 'np@example.com'),
            'setup_email_sent': true,
          },
        ),
      });

      await tester.tap(find.text('Add user'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Parent'));
      await tester.pumpAndSettle();
      await type(tester, 'Full name', 'New Parent');
      await type(tester, 'Email', 'np@example.com');
      await type(tester, 'Phone number', '07011112222');
      await tester.tap(find.widgetWithText(FilledButton, 'Add user'));
      await tester.pumpAndSettle();

      expect(g.backend.bodies['POST /schools/users'], {
        'name': 'New Parent',
        'email': 'np@example.com',
        'phone': '07011112222',
        'role': 'parent',
      });
      expect(find.text('New Parent added as a parent'), findsOneWidget);
      expect(
        find.textContaining('has been sent to np@example.com'),
        findsOneWidget,
      );

      await tester.tap(find.text('Add another'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(FilledButton, 'Add user'), findsOneWidget);

      // Back to the list: the new user is there.
      final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
      expect(nav.canPop(), isTrue);
    });

    testWidgets('if the email could not be sent, the admin can resend it', (
      tester,
    ) async {
      final g = await openUsers(tester, {
        'GET /schools/users': (200, []),
        'POST /schools/users': (
          201,
          {
            ...userJson(id: 31, name: 'No Mail', role: 'gate_staff'),
            'setup_email_sent': false,
          },
        ),
        'POST /schools/users/31/setup-email': (200, {'email_sent': true}),
      });

      await tester.tap(find.text('Add user'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gate staff'));
      await tester.pumpAndSettle();
      await type(tester, 'Full name', 'No Mail');
      await type(tester, 'Email', 'bayo@example.com');
      await type(tester, 'Phone number', '07011112222');
      await tester.tap(find.widgetWithText(FilledButton, 'Add user'));
      await tester.pumpAndSettle();

      expect(find.text('No Mail added as gate staff'), findsOneWidget);
      expect(find.textContaining('could not be sent'), findsOneWidget);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Send link'));
      await tester.pumpAndSettle();
      expect(g.backend.count('POST /schools/users/31/setup-email'), 1);
      expect(
        find.textContaining('A set-password link was sent to'),
        findsOneWidget,
      );
    });

    testWidgets('the form catches problems before sending', (tester) async {
      final g = await openUsers(tester, {'GET /schools/users': (200, [])});

      await tester.tap(find.text('Add user'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Add user'));
      await tester.pumpAndSettle();

      expect(
        find.text('Choose whether this is a parent or gate staff.'),
        findsOneWidget,
      );
      expect(g.backend.count('POST /schools/users'), 0);
    });

    testWidgets('shows the error and recovers on retry', (tester) async {
      final g = await openUsers(tester, {
        'GET /schools/users': (500, {'detail': 'boom'}),
      });
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /schools/users'] = (200, [userJson()]);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('Bayo Adeyemi'), findsOneWidget);
    });

    testWidgets('Show more loads the next 50', (tester) async {
      final g = await openUsers(tester, {'GET /schools/users': (200, [])});
      // Tall enough that every card of both pages is built (lists are lazy).
      tester.view.physicalSize = const Size(800, 30000);
      g.backend.handlers['GET /schools/users'] = (o) {
        final offset = o.queryParameters['offset'] as int;
        final count = offset == 0 ? 51 : 3;
        return (
          200,
          [
            for (var i = 0; i < count; i++)
              userJson(id: offset + i + 1, name: 'User ${offset + i + 1}'),
          ],
        );
      };
      await tester.tap(find.widgetWithText(ChoiceChip, 'Parents'));
      await tester.pumpAndSettle();

      expect(find.textContaining('User '), findsNWidgets(50));
      await tester.ensureVisible(find.text('Show more'));
      await tester.tap(find.text('Show more'));
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /schools/users']!['offset'], 50);
      expect(find.textContaining('User '), findsNWidgets(53));
      expect(find.text('Show more'), findsNothing);
    });
  });
}
