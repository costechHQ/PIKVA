import '../../../core/api/api_exception.dart';
import 'token_claims.dart';
import 'token_store.dart';

/// Renews the access token when less than half of its idle window is left
/// (SRS 6.10), so people who keep using the app stay signed in.
class SessionRenewer {
  SessionRenewer({
    required this._tokens,
    required this._requestNewToken,
    DateTime Function()? clock,
  }) : _now = clock ?? DateTime.now;

  final TokenStore _tokens;
  final Future<String> Function() _requestNewToken;
  final DateTime Function() _now;

  Future<void>? _inFlight;

  /// Call before a request the person made. Never throws: if renewal fails
  /// the request goes ahead, and a real 401 is handled by the API client.
  Future<void> ensureFresh() {
    return _inFlight ??= _renewIfNeeded().whenComplete(() => _inFlight = null);
  }

  Future<void> _renewIfNeeded() async {
    final token = await _tokens.read();
    if (token == null) return;

    final claims = TokenClaims.tryParse(token);
    if (claims == null) return; // unreadable: let the backend judge it

    final remaining = claims.remaining(_now());
    if (remaining <= Duration.zero) return; // expired: no grace period
    if (remaining * 2 >= claims.lifetime) return; // still more than half left

    try {
      await _tokens.write(await _requestNewToken());
    } on ApiException {
      // 401 is reported by the API client; other errors (offline) are retried
      // on the next request.
    }
  }
}
