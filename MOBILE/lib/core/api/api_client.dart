import 'package:dio/dio.dart';

import 'api_config.dart';
import 'api_exception.dart';

typedef TokenProvider = Future<String?> Function();

/// Thin wrapper over Dio. Adds the Bearer token (when a [tokenProvider] is
/// given) and turns every failure into an [ApiException].
///
/// Session hooks (SRS 6.10):
/// - [beforeRequest] runs before each request so the session can be renewed.
///   It is skipped for `background` requests (automatic polling is not
///   activity) and for `skipSession` requests (the renewal call itself).
/// - [onUnauthorized] runs when a request that carried a token gets a 401,
///   meaning the session is over. A wrong password on login sends no token,
///   so it does not count.
class ApiClient {
  ApiClient({
    String? baseUrl,
    TokenProvider? tokenProvider,
    Future<void> Function()? beforeRequest,
    void Function()? onUnauthorized,
    Dio? dio,
  }) : _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = baseUrl ?? ApiConfig.baseUrl
      ..connectTimeout = ApiConfig.connectTimeout
      ..receiveTimeout = ApiConfig.receiveTimeout
      ..headers['Accept'] = 'application/json';

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final skip = options.extra[_background] == true ||
              options.extra[_skipSession] == true;
          if (!skip) await beforeRequest?.call();

          final token = await tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (e, handler) {
          final sentToken =
              e.requestOptions.headers.containsKey('Authorization');
          if (e.response?.statusCode == 401 && sentToken) {
            onUnauthorized?.call();
          }
          handler.reject(
            DioException(
              requestOptions: e.requestOptions,
              response: e.response,
              type: e.type,
              error: ApiException.fromDio(e),
            ),
          );
        },
      ),
    );
  }

  static const _background = 'pikva_background';
  static const _skipSession = 'pikva_skip_session';

  final Dio _dio;

  Options _options({bool background = false, bool skipSession = false}) =>
      Options(extra: {_background: background, _skipSession: skipSession});

  /// Set [background] for automatic requests such as polling, so they do not
  /// renew the session.
  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    bool background = false,
  }) =>
      _send(() => _dio.get<T>(
            path,
            queryParameters: query,
            options: _options(background: background),
          ));

  Future<T> post<T>(String path, {Object? body, bool skipSession = false}) =>
      _send(() => _dio.post<T>(
            path,
            data: body,
            options: _options(skipSession: skipSession),
          ));

  Future<T> patch<T>(String path, {Object? body}) =>
      _send(() => _dio.patch<T>(path, data: body, options: _options()));

  Future<T> delete<T>(String path) =>
      _send(() => _dio.delete<T>(path, options: _options()));

  /// Multipart upload, used for pupil and picker photos.
  Future<T> upload<T>(String path, FormData form) =>
      _send(() => _dio.post<T>(path, data: form, options: _options()));

  /// Raw bytes, for photos that need the Bearer header.
  Future<List<int>> getBytes(String path) async {
    final r = await _send(
      () => _dio.get<List<int>>(
        path,
        options: Options(
          responseType: ResponseType.bytes,
          extra: {_background: false, _skipSession: false},
        ),
      ),
    );
    return r;
  }

  Future<T> _send<T>(Future<Response<T>> Function() call) async {
    try {
      final r = await call();
      return r.data as T;
    } on DioException catch (e) {
      final err = e.error;
      throw err is ApiException ? err : ApiException.fromDio(e);
    }
  }
}
