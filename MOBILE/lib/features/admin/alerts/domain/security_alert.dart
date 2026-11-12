/// Which alerts to list.
enum AlertFilter {
  open('Open'),
  resolved('Resolved'),
  all('All');

  const AlertFilter(this.label);
  final String label;

  /// The `status` query value, or null for no filter.
  String? get query => this == AlertFilter.all ? null : name;
}

/// A failed or refused pickup check the school should review (SRS 13).
/// People are referred to by ID only; names are looked up separately.
class SecurityAlert {
  const SecurityAlert({
    required this.id,
    required this.pupilId,
    required this.authorisationId,
    required this.attemptedBy,
    required this.type,
    required this.message,
    required this.createdAt,
    required this.resolvedAt,
  });

  final int id;
  final int? pupilId;
  final int? authorisationId;
  final int? attemptedBy;
  final String type;
  final String message;
  final DateTime createdAt;
  final DateTime? resolvedAt;

  bool get isOpen => resolvedAt == null;

  /// Repeated failed attempts may mean someone is guessing codes; a refused
  /// pickup means the wrong person came with a valid code (SRS 11.4).
  bool get isUrgent =>
      type == 'repeated_failed_attempts' || type == 'pickup_refused';

  String get title => alertTitle(type);

  factory SecurityAlert.fromJson(Map<String, dynamic> json) {
    final resolved = json['resolved_at'] as String?;
    return SecurityAlert(
      id: json['id'] as int,
      pupilId: json['pupil_id'] as int?,
      authorisationId: json['authorisation_id'] as int?,
      attemptedBy: json['attempted_by'] as int?,
      type: json['alert_type'] as String,
      message: json['message'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      resolvedAt: resolved == null ? null : DateTime.parse(resolved),
    );
  }
}

const _titles = {
  'invalid_code': 'Unrecognised code',
  'wrong_pupil': 'Code for a different pupil',
  'wrong_authorisation': 'Code for a different person',
  'used_code': 'Code used again',
  'expired_code': 'Expired code',
  'authorisation_inactive': 'Deactivated pickup person',
  'authorisation_pending': 'Pickup person not approved',
  'authorisation_scheduled': 'Pickup person not started',
  'authorisation_expired': "Pickup person's permission ended",
  'repeated_failed_attempts': 'Repeated failed attempts',
  'pickup_refused': 'Pickup refused at the gate',
};

/// A short title for an alert type; unknown types are shown as written.
String alertTitle(String type) => _titles[type] ?? type.replaceAll('_', ' ');

/// Names for the IDs an alert refers to. An ID missing here is shown as a
/// number.
class AlertNames {
  const AlertNames({
    this.pupils = const {},
    this.people = const {},
    this.staff = const {},
  });

  final Map<int, String> pupils;
  final Map<int, String> people;
  final Map<int, String> staff;
}
