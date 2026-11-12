import 'dart:convert';

/// The outcome of checking a pickup code (`PickupCodeCheckResult`).
enum CheckResult {
  valid,
  invalidCode,
  wrongPupil,
  wrongAuthorisation,
  usedCode,
  expiredCode,
  authorisationInactive,
  authorisationPending,
  authorisationScheduled,
  authorisationExpired,

  /// A result the backend added after this app was built. Never releases.
  unknown;

  static CheckResult parse(String? value) => switch (value) {
    'valid' => valid,
    'invalid_code' => invalidCode,
    'wrong_pupil' => wrongPupil,
    'wrong_authorisation' => wrongAuthorisation,
    'used_code' => usedCode,
    'expired_code' => expiredCode,
    'authorisation_inactive' => authorisationInactive,
    'authorisation_pending' => authorisationPending,
    'authorisation_scheduled' => authorisationScheduled,
    'authorisation_expired' => authorisationExpired,
    _ => unknown,
  };
}

/// What gate staff are told for a failed result (same words as the web app).
({String title, String detail}) failureText(CheckResult result) =>
    switch (result) {
      CheckResult.invalidCode => (
        title: 'Code not recognised',
        detail:
            'Check the code with the person. If it still fails, contact the '
            'school office.',
      ),
      CheckResult.wrongPupil => (
        title: 'Code is for a different pupil',
        detail: 'This code does not belong to this pupil.',
      ),
      CheckResult.wrongAuthorisation => (
        title: 'Code is for a different person',
        detail: 'This code was issued to someone else.',
      ),
      CheckResult.usedCode => (
        title: 'Code already used',
        detail: 'This code has already released a pupil today.',
      ),
      CheckResult.expiredCode => (
        title: 'Code has expired',
        detail: 'The parent can get a new code from Pikva.',
      ),
      CheckResult.authorisationInactive => (
        title: 'Pickup person is deactivated',
        detail: 'They are not allowed to collect at the moment.',
      ),
      CheckResult.authorisationPending => (
        title: 'Not approved by the school yet',
        detail: 'The school has not approved this pickup person.',
      ),
      CheckResult.authorisationScheduled => (
        title: 'Not allowed to collect yet',
        detail: "This person's permission has not started.",
      ),
      CheckResult.authorisationExpired => (
        title: 'Permission has ended',
        detail: "This person's permission to collect has expired.",
      ),
      CheckResult.valid || CheckResult.unknown => (
        title: 'Check failed',
        detail: 'The code could not be accepted.',
      ),
    };

/// Codes are 8 characters from this alphabet (no 0, 1, I or O), as the
/// backend issues them.
const _alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const codeLength = 8;

/// Tidies a typed code (spaces and dashes removed, upper case) or says what
/// is wrong with it. A mistyped code is caught here because every failed
/// check at the backend raises a security alert.
({String? code, String? error}) normaliseCode(String input) {
  final code = input.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
  if (code.isEmpty) return (code: null, error: 'Enter the pickup code.');
  if (code.split('').any((c) => !_alphabet.contains(c))) {
    return (
      code: null,
      error:
          'Codes use letters and numbers only, never 0, 1, I or O. Check the '
          'code and try again.',
    );
  }
  if (code.length != codeLength) {
    return (
      code: null,
      error:
          'Codes are $codeLength characters long. Check the code and try '
          'again.',
    );
  }
  return (code: code, error: null);
}

const notAPickupQr =
    'This is not a Pikva pickup code. Ask for the QR code from the Pikva '
    'app, or type the code.';

/// Checks scanned text is a Pikva pickup QR (`{"code": ...}`) and returns it
/// unchanged for the backend, which reads only the code. Anything else is
/// rejected here, so scanning the wrong QR never raises a security alert.
({String? qrData, String? error}) parseQrData(String text) {
  if (text.length > 512) return (qrData: null, error: notAPickupQr);
  try {
    final payload = jsonDecode(text);
    final code = payload is Map ? payload['code'] : null;
    if (code is String && normaliseCode(code).error == null) {
      return (qrData: text, error: null);
    }
  } catch (_) {
    // not JSON
  }
  return (qrData: null, error: notAPickupQr);
}

/// What gate staff send to verify, refuse and release: a typed code or the
/// scanned QR text.
class GateRequest {
  const GateRequest.manual(String this.code) : qrData = null;
  const GateRequest.qr(String this.qrData) : code = null;

  final String? code;
  final String? qrData;

  Map<String, Object?> toJson() => code != null
      ? {'method': 'manual', 'code': code}
      : {'method': 'qr', 'qr_data': qrData};
}

class GatePupil {
  const GatePupil({
    required this.id,
    required this.firstName,
    required this.lastName,
  });

  final int id;
  final String firstName;
  final String lastName;

  String get fullName => '$firstName $lastName';

  factory GatePupil.fromJson(Map<String, dynamic> json) => GatePupil(
    id: json['id'] as int,
    firstName: json['first_name'] as String,
    lastName: json['last_name'] as String,
  );
}

class GatePicker {
  const GatePicker({
    required this.id,
    required this.name,
    required this.relationship,
    required this.photoUpdatedAt,
  });

  final int id;
  final String name;
  final String relationship;
  final DateTime? photoUpdatedAt;

  bool get hasPhoto => photoUpdatedAt != null;

  factory GatePicker.fromJson(Map<String, dynamic> json) {
    final photo = json['photo_updated_at'] as String?;
    return GatePicker(
      id: json['id'] as int,
      name: json['picker_name'] as String,
      relationship: json['relationship'] as String,
      photoUpdatedAt: photo == null ? null : DateTime.parse(photo),
    );
  }
}

/// `POST /pickup/verify`. Pupil and picker only come with a valid code.
class VerifyOutcome {
  const VerifyOutcome({required this.result, this.pupil, this.picker});

  final CheckResult result;
  final GatePupil? pupil;
  final GatePicker? picker;

  /// Only true when the server says valid AND sent who it is for. Anything
  /// less is treated as a failure, never as a pass.
  bool get verified =>
      result == CheckResult.valid && pupil != null && picker != null;

  factory VerifyOutcome.fromJson(Map<String, dynamic> json) => VerifyOutcome(
    result: CheckResult.parse(json['result'] as String?),
    pupil: json['pupil'] == null
        ? null
        : GatePupil.fromJson(json['pupil'] as Map<String, dynamic>),
    picker: json['authorisation'] == null
        ? null
        : GatePicker.fromJson(json['authorisation'] as Map<String, dynamic>),
  );
}

/// `POST /pickup/refuse`. [result] says why when nothing was refused.
class RefuseOutcome {
  const RefuseOutcome({required this.result});

  final CheckResult result;

  bool get refused => result == CheckResult.valid;

  factory RefuseOutcome.fromJson(Map<String, dynamic> json) =>
      RefuseOutcome(result: CheckResult.parse(json['result'] as String?));
}

/// `POST /pickup/release`.
class ReleaseOutcome {
  const ReleaseOutcome({required this.result, this.releasedAt});

  final CheckResult result;
  final DateTime? releasedAt;

  bool get released => result == CheckResult.valid && releasedAt != null;

  factory ReleaseOutcome.fromJson(Map<String, dynamic> json) {
    final at = json['released_at'] as String?;
    return ReleaseOutcome(
      result: CheckResult.parse(json['result'] as String?),
      releasedAt: at == null ? null : DateTime.parse(at),
    );
  }
}
