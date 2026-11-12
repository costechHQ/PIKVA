import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/core/api/api_exception.dart';
import 'package:pikva/core/router/app_router.dart';
import 'package:pikva/features/auth/data/session_renewer.dart';
import 'package:pikva/features/auth/data/token_claims.dart';
import 'package:pikva/features/auth/data/token_store.dart';

/// An unsigned JWT with the given iat/exp (seconds). The app never verifies
/// signatures, so this is enough.
String jwt({required DateTime iat, required DateTime exp}) {
  String enc(Object o) =>
      base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'HS256'})}.'
      '${enc({'iat': iat.millisecondsSinceEpoch ~/ 1000, 'exp': exp.millisecondsSinceEpoch ~/ 1000})}.sig';
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final (int, Object) Function(RequestOptions) respond;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(
      RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    calls.add('${o.method} ${o.path}');
    final (status, body) = respond(o);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  final now = DateTime.utc(2026, 11, 12, 12);

  group('TokenClaims', () {
    test('reads iat and exp', () {
      final c = TokenClaims.tryParse(jwt(
        iat: now,
        exp: now.add(const Duration(minutes: 30)),
      ))!;
      expect(c.lifetime, const Duration(minutes: 30));
      expect(c.remaining(now.add(const Duration(minutes: 10))),
          const Duration(minutes: 20));
    });

    test('returns null for garbage', () {
      expect(TokenClaims.tryParse('not-a-token'), isNull);
      expect(TokenClaims.tryParse('a.b.c'), isNull);
    });
  });

  group('SessionRenewer', () {
    Future<(MemoryTokenStore, SessionRenewer, List<int>)> setup(
      String token,
      DateTime at, {
      Future<String> Function()? renew,
    }) async {
      final store = MemoryTokenStore();
      await store.write(token);
      final calls = <int>[];
      final r = SessionRenewer(
        tokens: store,
        clock: () => at,
        requestNewToken: () {
          calls.add(1);
          return renew != null ? renew() : Future.value('new-token');
        },
      );
      return (store, r, calls);
    }

    final token = jwt(iat: now, exp: now.add(const Duration(minutes: 30)));

    test('does nothing while more than half the window is left', () async {
      final (store, r, calls) =
          await setup(token, now.add(const Duration(minutes: 10)));
      await r.ensureFresh();
      expect(calls, isEmpty);
      expect(await store.read(), token);
    });

    test('renews and stores the new token below half', () async {
      final (store, r, calls) =
          await setup(token, now.add(const Duration(minutes: 20)));
      await r.ensureFresh();
      expect(calls, hasLength(1));
      expect(await store.read(), 'new-token');
    });

    test('does not try to renew an expired token', () async {
      final (store, r, calls) =
          await setup(token, now.add(const Duration(minutes: 31)));
      await r.ensureFresh();
      expect(calls, isEmpty);
      expect(await store.read(), token);
    });

    test('keeps the old token when renewal fails', () async {
      final (store, r, _) = await setup(
        token,
        now.add(const Duration(minutes: 20)),
        renew: () async => throw const ApiException(
          kind: ApiErrorKind.network,
          message: 'offline',
        ),
      );
      await r.ensureFresh();
      expect(await store.read(), token);
    });

    test('simultaneous requests share one renewal', () async {
      final (_, r, calls) =
          await setup(token, now.add(const Duration(minutes: 20)));
      await Future.wait([r.ensureFresh(), r.ensureFresh(), r.ensureFresh()]);
      expect(calls, hasLength(1));
    });
  });

  group('ApiClient session hooks', () {
    ApiClient build(
      _Adapter a, {
      String? token,
      void Function()? onUnauthorized,
      Future<void> Function()? before,
    }) =>
        ApiClient(
          baseUrl: 'http://test',
          tokenProvider: () async => token,
          beforeRequest: before,
          onUnauthorized: onUnauthorized,
          dio: Dio()..httpClientAdapter = a,
        );

    test('a 401 on a request that sent a token ends the session', () async {
      var expired = 0;
      final c = build(_Adapter((_) => (401, {'detail': 'x'})),
          token: 't', onUnauthorized: () => expired++);
      await expectLater(c.get('/pupils'), throwsA(isA<ApiException>()));
      expect(expired, 1);
    });

    test('a 401 without a token (wrong password) does not', () async {
      var expired = 0;
      final c = build(_Adapter((_) => (401, {'detail': 'bad'})),
          onUnauthorized: () => expired++);
      await expectLater(
          c.post('/auth/login', body: {}), throwsA(isA<ApiException>()));
      expect(expired, 0);
    });

    test('background requests do not trigger the renewal hook', () async {
      var hooks = 0;
      final c = build(_Adapter((_) => (200, {})),
          token: 't', before: () async => hooks++);
      await c.get<Map<String, dynamic>>('/alerts', background: true);
      expect(hooks, 0);
      await c.get<Map<String, dynamic>>('/pupils');
      expect(hooks, 1);
    });

    test('the renewal call itself skips the hook (no loop)', () async {
      var hooks = 0;
      final c = build(_Adapter((_) => (200, {})),
          token: 't', before: () async => hooks++);
      await c.post<Map<String, dynamic>>('/auth/refresh', skipSession: true);
      expect(hooks, 0);
    });
  });

  group('isSafeNext', () {
    const home = '/parent';
    test('accepts a page inside the role area', () {
      expect(isSafeNext('/parent', home), isTrue);
      expect(isSafeNext('/parent/pupils?x=1', home), isTrue);
    });

    test('rejects everything else', () {
      for (final bad in [
        null,
        '',
        'parent',
        '//evil.com',
        'https://evil.com/parent',
        '/\\evil.com',
        '/admin',
        '/api/v1/pupils',
        '/parentish',
      ]) {
        expect(isSafeNext(bad, home), isFalse, reason: '$bad');
      }
    });
  });
}
