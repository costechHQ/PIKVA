import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/core/router/app_router.dart';
import 'package:pikva/features/auth/data/auth_repository.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/presentation/auth_controller.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

/// A fake backend whose session can be ended mid-test.
class _Backend implements HttpClientAdapter {
  bool sessionValid = true;

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    final h = {
      Headers.contentTypeHeader: ['application/json'],
    };
    ResponseBody json(int status, Object body) =>
        ResponseBody.fromString(jsonEncode(body), status, headers: h);

    if (o.path == '/auth/login') {
      sessionValid = true;
      return json(200, {'access_token': 'new', 'token_type': 'bearer'});
    }
    if (o.path == '/auth/me') {
      if (!sessionValid) {
        return json(401, {'detail': 'Invalid or expired token'});
      }
      return json(200, {
        'id': 1,
        'school_id': 1,
        'name': 'Test Parent',
        'email': 'p@example.com',
        'phone': '08000000000',
        'role': 'parent',
        'school_name': 'Sunrise School',
      });
    }
    return json(404, {'detail': 'nope'});
  }

  @override
  void close({bool force = false}) {}
}

({AuthController auth, _Backend backend}) _app() {
  final backend = _Backend();
  final tokens = MemoryTokenStore()..write('t');
  late final AuthController auth;
  final api = ApiClient(
    baseUrl: 'http://test',
    tokenProvider: tokens.read,
    onUnauthorized: () => auth.expireSession(),
    dio: Dio()..httpClientAdapter = backend,
  );
  auth = AuthController(AuthRepository(api: api, tokens: tokens));
  return (auth: auth, backend: backend);
}

String _where(WidgetTester t) =>
    GoRouter.of(t.element(find.byType(Scaffold).first)).state.uri.toString();

void main() {
  testWidgets('an ended session goes to login with the page kept, then back', (
    tester,
  ) async {
    final app = _app();
    await tester.pumpWidget(PikvaApp(auth: app.auth, repos: stubRepos()));
    await tester.pumpAndSettle();
    expect(_where(tester), Routes.parent);

    // The session ends while the app is in the background; on resume we check.
    app.backend.sessionValid = false;
    // Not awaited: the test clock only advances inside pump.
    app.auth.checkSession();
    await tester.pumpAndSettle();

    expect(app.auth.sessionExpired, isTrue);
    expect(_where(tester), '/login?next=%2Fparent');
    expect(
      find.text('Your session ended. Sign in again to continue.'),
      findsOneWidget,
    );

    await tester.enterText(find.byType(TextFormField).first, 'p@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'secret');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(_where(tester), Routes.parent);
    expect(app.auth.sessionExpired, isFalse);
  });

  testWidgets('tapping sign out does not keep the page', (tester) async {
    // Tall enough that the Account screen needs no scrolling.
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final app = _app();
    await tester.pumpWidget(PikvaApp(auth: app.auth, repos: stubRepos()));
    await tester.pumpAndSettle();

    // Sign out now lives on the Account tab, behind a confirmation.
    await tester.tap(find.widgetWithText(NavigationDestination, 'Account'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();

    expect(_where(tester), Routes.login);
    expect(
      find.text('Your session ended. Sign in again to continue.'),
      findsNothing,
    );
  });

  testWidgets('an unsafe next is ignored after sign in', (tester) async {
    final app = _app();
    await tester.pumpWidget(PikvaApp(auth: app.auth, repos: stubRepos()));
    await tester.pumpAndSettle();

    GoRouter.of(tester.element(find.byType(Scaffold).first))
        .go('/login?next=//evil.com');
    await tester.pumpAndSettle();

    // Already signed in, so the login route bounces to the role home.
    expect(_where(tester), Routes.parent);
  });
}
