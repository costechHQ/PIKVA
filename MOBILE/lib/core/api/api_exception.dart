import 'package:dio/dio.dart';

enum ApiErrorKind {
  /// No connection, DNS failure, server unreachable.
  network,
  timeout,

  /// 401: missing, invalid or expired token.
  unauthorized,

  /// 403: signed in but not allowed.
  forbidden,
  notFound,

  /// 422: the request body failed validation.
  validation,

  /// 429: rate limited; see [ApiException.retryAfter].
  rateLimited,
  server,
  cancelled,
  unknown,
}

/// The one error type the rest of the app sees. Screens show [message];
/// session code reacts to [kind].
class ApiException implements Exception {
  const ApiException({
    required this.kind,
    required this.message,
    this.statusCode,
    this.retryAfter,
  });

  final ApiErrorKind kind;
  final String message;
  final int? statusCode;
  final Duration? retryAfter;

  bool get isUnauthorized => kind == ApiErrorKind.unauthorized;

  factory ApiException.fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiException(
          kind: ApiErrorKind.timeout,
          message: 'The server took too long to respond. Please try again.',
        );
      case DioExceptionType.connectionError:
        return const ApiException(
          kind: ApiErrorKind.network,
          message: 'Cannot reach the server. Check your connection.',
        );
      case DioExceptionType.cancel:
        return const ApiException(
          kind: ApiErrorKind.cancelled,
          message: 'Request cancelled.',
        );
      case DioExceptionType.badResponse:
        return _fromResponse(e.response!);
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return ApiException(
          kind: e.error is Exception && e.response == null
              ? ApiErrorKind.network
              : ApiErrorKind.unknown,
          message: 'Something went wrong. Please try again.',
        );
    }
  }

  static ApiException _fromResponse(Response<dynamic> r) {
    final status = r.statusCode ?? 0;
    final detail = _detailMessage(r.data);

    switch (status) {
      case 401:
        return ApiException(
          kind: ApiErrorKind.unauthorized,
          statusCode: status,
          message: detail ?? 'Your session has expired. Please sign in again.',
        );
      case 403:
        return ApiException(
          kind: ApiErrorKind.forbidden,
          statusCode: status,
          message: detail ?? 'You do not have permission to do that.',
        );
      case 404:
        return ApiException(
          kind: ApiErrorKind.notFound,
          statusCode: status,
          message: detail ?? 'Not found.',
        );
      case 422:
        return ApiException(
          kind: ApiErrorKind.validation,
          statusCode: status,
          message: detail ?? 'Some of the details are not valid.',
        );
      case 429:
        final seconds = int.tryParse(r.headers.value('retry-after') ?? '');
        return ApiException(
          kind: ApiErrorKind.rateLimited,
          statusCode: status,
          retryAfter: seconds == null ? null : Duration(seconds: seconds),
          message: detail ?? 'Too many attempts. Please wait and try again.',
        );
      default:
        if (status >= 500) {
          return ApiException(
            kind: ApiErrorKind.server,
            statusCode: status,
            message: 'The server had a problem. Please try again later.',
          );
        }
        return ApiException(
          kind: ApiErrorKind.unknown,
          statusCode: status,
          message: detail ?? 'Something went wrong. Please try again.',
        );
    }
  }

  /// FastAPI sends `{"detail": "text"}`, or for 422
  /// `{"detail": [{"loc": [...], "msg": "..."}]}`.
  static String? _detailMessage(dynamic data) {
    if (data is! Map) return null;
    final detail = data['detail'];
    if (detail is String && detail.isNotEmpty) return detail;
    if (detail is List && detail.isNotEmpty) {
      final first = detail.first;
      if (first is Map && first['msg'] is String) {
        return first['msg'] as String;
      }
    }
    return null;
  }

  @override
  String toString() => 'ApiException($kind, $statusCode, $message)';
}
