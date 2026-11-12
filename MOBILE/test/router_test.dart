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

class _Adapter implements HttpClientAdapter {
  _Adapter(this.role);

  final String? role; // null = /auth/me answers 401

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    final headers = {
      Headers.contentTypeHeader: ['application/json'],
    };
    if (o.path == '/auth/me') {
      if (role == null) {
        return ResponseBody.fromString(
          '{"detail":"expired"}',
          401,
          headers: headers,
        );
      }
      return ResponseBody.fromString(
        jsonEncode({
          'id': 1,
          'school_id': 1,
          'name': 'Test User',
          'email': 't@example.com',
          'phone': '08000000000',
          'role': role,
          'school_name': 'Sunrise School',
        }),
        200,
        headers: headers,
      );
    }
    return ResponseBody.fromString('{"detail":"nope"}', 404, headers: headers);
  }

  @override
  void close({bool force = false}) {}
}

AuthController _auth({String? role, bool withToken = true}) {
  final tokens = MemoryTokenStore();
  if (withToken) tokens.write('t');
  final api = ApiClient(
    baseUrl: 'http://test',
    tokenProvider: tokens.read,
    dio: Dio()..httpClientAdapter = _Adapter(role),
  );
  return AuthController(AuthRepository(api: api, tokens: tokens));
}

String _location(WidgetTester tester) {
  final ctx = tester.element(find.byType(Scaffold).first);
  return GoRouter.of(ctx).state.uri.path;
}

void main() {
  testWidgets('signed out users land on login', (tester) async {
    await tester.pumpWidget(
      PikvaApp(auth: _auth(withToken: false), repos: stubRepos()),
    );
    await tester.pumpAndSettle();
    expect(_location(tester), Routes.login);
  });

  for (final c in [
    ('parent', Routes.parent, 'My children'),
    ('gate_staff', Routes.gate, 'Check a pickup code'),
    ('school_admin', Routes.admin, 'Security alerts'),
  ]) {
    testWidgets('${c.$1} lands on ${c.$2}', (tester) async {
      await tester.pumpWidget(
        PikvaApp(
          auth: _auth(role: c.$1),
          repos: stubRepos(),
        ),
      );
      await tester.pumpAndSettle();
      expect(_location(tester), c.$2);
      expect(find.text(c.$3), findsOneWidget);
    });
  }

  testWidgets('a parent cannot navigate into the admin area', (tester) async {
    await tester.pumpWidget(
      PikvaApp(
        auth: _auth(role: 'parent'),
        repos: stubRepos(),
      ),
    );
    await tester.pumpAndSettle();

    GoRouter.of(tester.element(find.byType(Scaffold).first)).go(Routes.admin);
    await tester.pumpAndSettle();

    expect(_location(tester), Routes.parent);
  });

  testWidgets('sign out returns to login', (tester) async {
    // Tall enough that the Account screen needs no scrolling.
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      PikvaApp(
        auth: _auth(role: 'parent'),
        repos: stubRepos(),
      ),
    );
    await tester.pumpAndSettle();

    // Sign out now lives on the Account tab, behind a confirmation.
    await tester.tap(find.widgetWithText(NavigationDestination, 'Account'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();

    expect(_location(tester), Routes.login);
  });

  testWidgets('an expired saved token lands on login', (tester) async {
    await tester.pumpWidget(PikvaApp(auth: _auth(), repos: stubRepos()));
    await tester.pumpAndSettle();
    expect(_location(tester), Routes.login);
  });
}
