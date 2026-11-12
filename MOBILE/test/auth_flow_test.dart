import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/features/auth/data/auth_repository.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/presentation/auth_controller.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  /// "METHOD path" -> (status, body)
  final Map<String, (int, Object)> routes;

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s,
      Future<void>? c) async {
    final hit = routes['${o.method} ${o.path}'];
    if (hit == null) return ResponseBody.fromString('{"detail":"nope"}', 404);
    return ResponseBody.fromString(jsonEncode(hit.$2), hit.$1, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

const _me = {
  'id': 7,
  'school_id': 1,
  'name': 'Ada Obi',
  'email': 'ada@example.com',
  'phone': '08012345678',
  'role': 'parent',
  'school_name': 'Sunrise School',
};

(AuthController, MemoryTokenStore) _build(Map<String, (int, Object)> routes) {
  final tokens = MemoryTokenStore();
  final api = ApiClient(
    baseUrl: 'http://test',
    tokenProvider: tokens.read,
    dio: Dio()..httpClientAdapter = _Adapter(routes),
  );
  return (AuthController(AuthRepository(api: api, tokens: tokens)), tokens);
}

void main() {
  test('sign in saves the token and loads the user', () async {
    final (auth, tokens) = _build({
      'POST /auth/login': (200, {'access_token': 't1', 'token_type': 'bearer'}),
      'GET /auth/me': (200, _me),
    });

    await auth.signIn('  ada@example.com ', 'pw');

    expect(auth.status, AuthStatus.signedIn);
    expect(auth.user!.name, 'Ada Obi');
    expect(await tokens.read(), 't1');
  });

  test('wrong password leaves us signed out with no token', () async {
    final (auth, tokens) = _build({
      'POST /auth/login': (401, {'detail': 'Incorrect email or password'}),
    });

    await expectLater(auth.signIn('a@b.co', 'bad'), throwsA(anything));

    expect(auth.status, AuthStatus.unknown);
    expect(await tokens.read(), isNull);
  });

  test('sign in removes the token again if /auth/me fails', () async {
    final (auth, tokens) = _build({
      'POST /auth/login': (200, {'access_token': 't1', 'token_type': 'bearer'}),
      'GET /auth/me': (500, {'detail': 'x'}),
    });

    await expectLater(auth.signIn('a@b.co', 'pw'), throwsA(anything));

    expect(await tokens.read(), isNull);
  });

  test('restore with no token goes to signed out', () async {
    final (auth, _) = _build({});
    await auth.restore();
    expect(auth.status, AuthStatus.signedOut);
  });

  test('restore with a good token signs in', () async {
    final (auth, tokens) = _build({'GET /auth/me': (200, _me)});
    await tokens.write('t1');
    await auth.restore();
    expect(auth.status, AuthStatus.signedIn);
  });

  test('restore with an expired token clears it', () async {
    final (auth, tokens) = _build({
      'GET /auth/me': (401, {'detail': 'Invalid or expired token'}),
    });
    await tokens.write('old');
    await auth.restore();
    expect(auth.status, AuthStatus.signedOut);
    expect(await tokens.read(), isNull);
  });

  test('sign out clears the token', () async {
    final (auth, tokens) = _build({'GET /auth/me': (200, _me)});
    await tokens.write('t1');
    await auth.restore();
    await auth.signOut();
    expect(auth.status, AuthStatus.signedOut);
    expect(await tokens.read(), isNull);
  });
}
