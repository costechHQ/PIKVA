import 'package:dio/dio.dart';

import 'api_config.dart';
import 'api_exception.dart';

typedef TokenProvider = Future<String?> Function();

/// Thin wrapper over Dio. Adds the Bearer token (when a [tokenProvider] is
/// given) and turns every failure into an [ApiException].
class ApiClient {
  ApiClient({
    String? baseUrl,
    TokenProvider? tokenProvider,
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
          final token = await tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (e, handler) {
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

  final Dio _dio;

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get<T>(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? body}) =>
      _send(() => _dio.post<T>(path, data: body));

  Future<T> patch<T>(String path, {Object? body}) =>
      _send(() => _dio.patch<T>(path, data: body));

  Future<T> delete<T>(String path) => _send(() => _dio.delete<T>(path));

  /// Multipart upload, used for pupil and picker photos.
  Future<T> upload<T>(String path, FormData form) =>
      _send(() => _dio.post<T>(path, data: form));

  /// Raw bytes, for photos that need the Bearer header.
  Future<List<int>> getBytes(String path) async {
    final r = await _send(
      () => _dio.get<List<int>>(
        path,
        options: Options(responseType: ResponseType.bytes),
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
