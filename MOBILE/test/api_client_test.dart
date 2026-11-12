import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/core/api/api_exception.dart';

/// Returns a canned response (or throws) instead of touching the network.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this._respond);

  final ResponseBody Function(RequestOptions) _respond;
  RequestOptions? last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    last = options;
    return _respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body, {Map<String, List<String>>? h}) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
        ...?h,
      },
    );

ApiClient _client(_FakeAdapter adapter, {TokenProvider? tokens}) {
  final dio = Dio()..httpClientAdapter = adapter;
  return ApiClient(
    baseUrl: 'http://test/api/v1',
    tokenProvider: tokens,
    dio: dio,
  );
}

Future<ApiException> _failure(Future<dynamic> call) async {
  try {
    await call;
  } on ApiException catch (e) {
    return e;
  }
  fail('expected an ApiException');
}

void main() {
  test('returns the decoded body and sends the Bearer token', () async {
    final adapter = _FakeAdapter((_) => _json(200, {'role': 'parent'}));
    final client = _client(adapter, tokens: () async => 'abc');

    final data = await client.get<Map<String, dynamic>>('/auth/me');

    expect(data['role'], 'parent');
    expect(adapter.last!.headers['Authorization'], 'Bearer abc');
    expect(adapter.last!.uri.toString(), 'http://test/api/v1/auth/me');
  });

  test('sends no Authorization header without a token', () async {
    final adapter = _FakeAdapter((_) => _json(200, {}));
    await _client(adapter).get<Map<String, dynamic>>('/health');
    expect(adapter.last!.headers.containsKey('Authorization'), isFalse);
  });

  test('401 becomes unauthorized with the backend message', () async {
    final adapter = _FakeAdapter(
      (_) => _json(401, {'detail': 'Invalid or expired token'}),
    );
    final e = await _failure(_client(adapter).get('/auth/me'));

    expect(e.kind, ApiErrorKind.unauthorized);
    expect(e.isUnauthorized, isTrue);
    expect(e.message, 'Invalid or expired token');
  });

  test('422 uses the first validation message', () async {
    final adapter = _FakeAdapter(
      (_) => _json(422, {
        'detail': [
          {
            'loc': ['body', 'email'],
            'msg': 'value is not a valid email',
          },
        ],
      }),
    );
    final e = await _failure(_client(adapter).post('/auth/login', body: {}));

    expect(e.kind, ApiErrorKind.validation);
    expect(e.message, 'value is not a valid email');
  });

  test('429 reads Retry-After', () async {
    final adapter = _FakeAdapter(
      (_) => _json(
        429,
        {'detail': 'Too many requests'},
        h: {
          'retry-after': ['30'],
        },
      ),
    );
    final e = await _failure(_client(adapter).post('/auth/login', body: {}));

    expect(e.kind, ApiErrorKind.rateLimited);
    expect(e.retryAfter, const Duration(seconds: 30));
  });

  test('500 hides server internals behind a friendly message', () async {
    final adapter = _FakeAdapter((_) => _json(500, {'detail': 'boom: stack'}));
    final e = await _failure(_client(adapter).get('/pupils'));

    expect(e.kind, ApiErrorKind.server);
    expect(e.message, isNot(contains('boom')));
  });

  test('a dropped connection becomes a network error', () async {
    final adapter = _FakeAdapter(
      (o) => throw DioException(
        requestOptions: o,
        type: DioExceptionType.connectionError,
      ),
    );
    final e = await _failure(_client(adapter).get('/pupils'));

    expect(e.kind, ApiErrorKind.network);
  });
}
