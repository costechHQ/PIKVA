enum UserRole {
  parent('parent'),
  gateStaff('gate_staff'),
  schoolAdmin('school_admin');

  const UserRole(this.value);
  final String value;

  /// Unknown roles return null so the app can refuse them instead of
  /// guessing a home screen.
  static UserRole? parse(String? value) {
    for (final r in UserRole.values) {
      if (r.value == value) return r;
    }
    return null;
  }
}

/// The signed-in user, from `GET /auth/me`.
class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.schoolId,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    required this.schoolName,
  });

  final int id;
  final int schoolId;
  final String name;
  final String email;
  final String phone;
  final UserRole role;
  final String schoolName;

  /// Throws [FormatException] for a role this app does not know.
  factory CurrentUser.fromJson(Map<String, dynamic> json) {
    final role = UserRole.parse(json['role'] as String?);
    if (role == null) {
      throw FormatException('Unknown role: ${json['role']}');
    }
    return CurrentUser(
      id: json['id'] as int,
      schoolId: json['school_id'] as int,
      name: json['name'] as String,
      email: json['email'] as String,
      phone: json['phone'] as String,
      role: role,
      schoolName: json['school_name'] as String,
    );
  }
}
