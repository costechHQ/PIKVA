import 'dart:convert';

/// The two timestamps of an access token that the app needs. The token is
/// NOT verified here (the app has no secret); the backend does that. These
/// values only decide when to ask for a renewal.
class TokenClaims {
  const TokenClaims({required this.issuedAt, required this.expiresAt});

  final DateTime issuedAt;
  final DateTime expiresAt;

  /// The idle window this token was issued with.
  Duration get lifetime => expiresAt.difference(issuedAt);

  Duration remaining(DateTime now) => expiresAt.difference(now);

  /// Null when the token is not a readable JWT with `iat` and `exp`.
  static TokenClaims? tryParse(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final json = jsonDecode(payload);
      if (json is! Map) return null;
      final iat = json['iat'];
      final exp = json['exp'];
      if (iat is! num || exp is! num) return null;
      return TokenClaims(
        issuedAt: DateTime.fromMillisecondsSinceEpoch(
          iat.toInt() * 1000,
          isUtc: true,
        ),
        expiresAt: DateTime.fromMillisecondsSinceEpoch(
          exp.toInt() * 1000,
          isUtc: true,
        ),
      );
    } catch (_) {
      return null;
    }
  }
}
