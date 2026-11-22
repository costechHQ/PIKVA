import '../core/api/api_exception.dart';

/// The message to show for a failed request. A rate limit says how long to
/// wait when the server tells us.
String errorText(ApiException e) {
  if (e.kind == ApiErrorKind.rateLimited && e.retryAfter != null) {
    final mins = (e.retryAfter!.inSeconds / 60).ceil();
    return 'Too many attempts. Try again in $mins minute${mins == 1 ? '' : 's'}.';
  }
  return e.message;
}
