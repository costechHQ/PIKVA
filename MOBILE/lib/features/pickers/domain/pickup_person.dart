enum PersonStatus {
  active,
  inactive,
  pendingApproval,
  scheduled,
  expired;

  String get label => switch (this) {
    PersonStatus.active => 'Active',
    PersonStatus.inactive => 'Inactive',
    PersonStatus.pendingApproval => 'Awaiting approval',
    PersonStatus.scheduled => 'Scheduled',
    PersonStatus.expired => 'Expired',
  };

  static PersonStatus parse(String value) => switch (value) {
    'active' => PersonStatus.active,
    'pending_approval' => PersonStatus.pendingApproval,
    'scheduled' => PersonStatus.scheduled,
    'expired' => PersonStatus.expired,
    // Anything new from the server reads as the safe, non-active state.
    _ => PersonStatus.inactive,
  };
}

/// A person a parent has authorised to collect a pupil
/// (a pickup authorisation, SRS 9).
class PickupPerson {
  const PickupPerson({
    required this.id,
    required this.pupilId,
    required this.name,
    required this.phone,
    required this.relationship,
    required this.type,
    required this.startsAt,
    required this.expiresAt,
    required this.isActive,
    required this.status,
    required this.photoUpdatedAt,
    required this.updatedAtRaw,
  });

  final int id;
  final int pupilId;
  final String name;
  final String phone;
  final String relationship;
  final String type;
  final DateTime startsAt;
  final DateTime expiresAt;
  final bool isActive;
  final PersonStatus status;
  final DateTime? photoUpdatedAt;

  /// `updated_at` exactly as the server sent it. Approving sends it back so
  /// a later change by the parent is never approved unseen (SRS 9.2).
  final String updatedAtRaw;

  DateTime get updatedAt => DateTime.parse(updatedAtRaw);

  bool get hasPhoto => photoUpdatedAt != null;

  String get initials {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  factory PickupPerson.fromJson(Map<String, dynamic> json) {
    final photo = json['photo_updated_at'] as String?;
    return PickupPerson(
      id: json['id'] as int,
      pupilId: json['pupil_id'] as int,
      name: json['picker_name'] as String,
      phone: json['picker_phone'] as String,
      relationship: json['relationship'] as String,
      type: json['type'] as String,
      startsAt: DateTime.parse(json['starts_at'] as String),
      expiresAt: DateTime.parse(json['expires_at'] as String),
      isActive: json['is_active'] as bool,
      status: PersonStatus.parse(json['status'] as String),
      photoUpdatedAt: photo == null ? null : DateTime.parse(photo),
      updatedAtRaw: json['updated_at'] as String,
    );
  }
}
