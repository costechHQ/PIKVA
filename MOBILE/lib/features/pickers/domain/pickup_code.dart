/// Today's one-time pickup code, as issued by `POST /pickup/codes`.
///
/// The server shows the code only once and never stores it in plaintext, so
/// this object must stay in memory only: never saved, logged or put in a
/// route.
class PickupCode {
  const PickupCode({
    required this.authorisationId,
    required this.code,
    required this.expiresAt,
    required this.qrData,
  });

  final int authorisationId;
  final String code;
  final DateTime expiresAt;

  /// The exact text the QR code must carry (the gate scanner reads it back).
  final String qrData;

  factory PickupCode.fromJson(Map<String, dynamic> json) => PickupCode(
    authorisationId: json['authorisation_id'] as int,
    code: json['code'] as String,
    expiresAt: DateTime.parse(json['expires_at'] as String),
    qrData: json['qr_data'] as String,
  );

  // No toString: keep the code out of logs and error messages.
}
