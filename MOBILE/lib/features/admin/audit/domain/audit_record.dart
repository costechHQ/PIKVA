import '../../alerts/domain/security_alert.dart' show alertTitle;

/// One audit record (SRS 14) as `GET /audit-logs` returns it. Metadata never
/// holds personal values, only things like which fields changed.
class AuditRecord {
  const AuditRecord({
    required this.id,
    required this.userName,
    required this.action,
    required this.entityType,
    required this.entityId,
    required this.metadata,
    required this.createdAt,
  });

  final int id;

  /// Null when the system did it, not a person.
  final String? userName;
  final String action;
  final String entityType;
  final int? entityId;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;

  String get actionText => actionLabel(action);

  factory AuditRecord.fromJson(Map<String, dynamic> json) => AuditRecord(
    id: json['id'] as int,
    userName: (json['user'] as Map<String, dynamic>?)?['name'] as String?,
    action: json['action'] as String,
    entityType: json['entity_type'] as String,
    entityId: json['entity_id'] as int?,
    metadata: json['metadata'] as Map<String, dynamic>?,
    createdAt: DateTime.parse(json['created_at'] as String),
  );
}

/// Every action the backend records, in the order the filter lists them,
/// with its plain wording.
const actionLabels = {
  'user.created': 'Added a user',
  'user.updated': 'Changed a user',
  'user.deactivated': 'Deactivated a user',
  'user.activated': 'Activated a user',
  'user.setup_email_sent': 'Sent a set-password link',
  'user.password_reset_requested': 'Asked to reset a password',
  'user.password_reset': 'Reset a password',
  'user.password_changed': 'Changed their password',
  'pupil.created': 'Added a pupil',
  'pupil.updated': 'Changed a pupil',
  'pickup_authorisation.created': 'Added a pickup person',
  'pickup_authorisation.updated': 'Changed a pickup person',
  'pickup_authorisation.activated': 'Activated a pickup person',
  'pickup_authorisation.deactivated': 'Deactivated a pickup person',
  'pickup_authorisation.approved': 'Approved a pickup person',
  'pickup_authorisation.photo_updated': "Uploaded a pickup person's photo",
  'pickup_authorisation.photo_removed': "Removed a pickup person's photo",
  'pickup_code.generated': 'Got a pickup code',
  'pupil.released': 'Released a pupil',
  'pickup.verification_failed': 'Failed pickup check',
  'pickup.refused': 'Refused a pickup',
  'alert.resolved': 'Resolved a security alert',
};

/// The wording for an action; an action this app does not know is shown as
/// written.
String actionLabel(String action) => actionLabels[action] ?? action;

const _fieldLabels = {
  'name': 'name',
  'email': 'email',
  'phone': 'phone',
  'first_name': 'first name',
  'last_name': 'last name',
  'date_of_birth': 'date of birth',
  'photo_url': 'photo',
  'picker_name': 'name',
  'picker_phone': 'phone',
  'relationship': 'relationship',
  'type': 'type',
  'starts_at': 'start time',
  'expires_at': 'end time',
};

const _roleLabels = {
  'parent': 'parent',
  'gate_staff': 'gate staff',
  'school_admin': 'administrator',
};

/// Short notes from a record's metadata, such as "Changed: name, phone" or
/// "Needs school approval again". IDs are left to the screen, which names
/// them.
List<String> auditNotes(Map<String, dynamic>? metadata) {
  if (metadata == null) return const [];
  final notes = <String>[];
  String? text(String key) {
    final v = metadata[key];
    return v is String ? v : null;
  }

  final fields = metadata['fields'];
  if (fields is List && fields.isNotEmpty) {
    notes.add(
      'Changed: ${fields.map((f) => _fieldLabels['$f'] ?? '$f').join(', ')}',
    );
  }
  if (metadata['approval_reset'] == true) {
    notes.add('Needs school approval again');
  }
  final sent = metadata['sent'];
  if (sent is bool) notes.add(sent ? 'Email sent' : 'Email could not be sent');
  final role = text('role');
  if (role != null) {
    notes.add(
      'Role: ${_roleLabels[role] ?? role}'
      '${text('via') == 'registration' ? ' (registered the school)' : ''}',
    );
  }
  final result = text('result');
  if (result != null) notes.add(alertTitle(result));
  final method = text('method') ?? text('verification_method');
  if (method != null) notes.add(method == 'qr' ? 'QR code' : 'Code entered');
  final stage = text('stage');
  if (stage != null) {
    notes.add(
      stage == 'release'
          ? 'At release'
          : stage == 'refuse'
          ? 'At refusal'
          : 'At check',
    );
  }
  final alertType = text('alert_type');
  if (alertType != null) notes.add(alertTitle(alertType));
  final codeDate = text('code_date');
  if (codeDate != null) notes.add('For $codeDate');
  return notes;
}

/// The pupil and pickup person a record is about, for naming them.
({int? pupilId, int? authorisationId}) auditLinks(AuditRecord record) {
  final meta = record.metadata ?? const <String, dynamic>{};
  int? id(Object? v) => v is int ? v : null;
  return (
    pupilId: record.entityType == 'pupil'
        ? record.entityId
        : id(meta['pupil_id']),
    authorisationId: record.entityType == 'pickup_authorisation'
        ? record.entityId
        : id(meta['authorisation_id']),
  );
}
