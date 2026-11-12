import '../../../../shared/form_result.dart';
import '../../../auth/domain/current_user.dart';

/// A user of the school as admins see them (`GET /schools/users`, SRS 6.7).
class SchoolUser {
  const SchoolUser({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    required this.isActive,
  });

  final int id;
  final String name;
  final String email;
  final String phone;

  /// Null for a role this app does not know; such a user is shown but never
  /// offered actions.
  final UserRole? role;

  /// False once an admin has deactivated the account.
  final bool isActive;

  /// Admins may edit and deactivate parents and gate staff, never another
  /// administrator (SRS 6.7).
  bool get isManageable =>
      role == UserRole.parent || role == UserRole.gateStaff;

  String get roleLabel => switch (role) {
    UserRole.parent => 'Parent',
    UserRole.gateStaff => 'Gate staff',
    UserRole.schoolAdmin => 'Admin',
    null => 'User',
  };

  factory SchoolUser.fromJson(Map<String, dynamic> json) => SchoolUser(
    id: json['id'] as int,
    name: json['name'] as String,
    email: json['email'] as String,
    phone: json['phone'] as String,
    role: UserRole.parse(json['role'] as String?),
    isActive: json['is_active'] as bool,
  );
}

/// The role filter on the users list.
enum RoleFilter {
  all('All', null),
  parents('Parents', 'parent'),
  gateStaff('Gate staff', 'gate_staff'),
  admins('Admins', 'school_admin');

  const RoleFilter(this.label, this.query);
  final String label;

  /// The `role` query value, or null for everyone.
  final String? query;
}

/// Roles an admin may create (SRS 6.7): never another administrator.
enum CreatableRole {
  parent('parent', 'Parent', 'Manages their pupils and pickup people.'),
  gateStaff(
    'gate_staff',
    'Gate staff',
    'Checks pickup codes and releases pupils.',
  );

  const CreatableRole(this.value, this.label, this.hint);
  final String value;
  final String label;
  final String hint;
}

const _nameMax = 150;
const _phoneMax = 30;

/// Longest search the server accepts.
const userSearchMax = 100;

final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// Trimmed name, email and phone, or the first problem with them. Shared by
/// add and edit. The server validates again, including that the email is
/// not already in use.
({String name, String email, String phone})? _contact(
  String name,
  String email,
  String phone,
  void Function(String) fail,
) {
  final n = name.trim();
  final e = email.trim();
  final p = phone.trim();
  if (n.isEmpty) {
    fail("Enter the person's full name.");
  } else if (n.length > _nameMax) {
    fail('The name can be at most $_nameMax characters.');
  } else if (!_email.hasMatch(e)) {
    fail('Enter a valid email address. The set-password link is sent there.');
  } else if (p.isEmpty) {
    fail("Enter the person's phone number.");
  } else if (p.length > _phoneMax) {
    fail('The phone number can be at most $_phoneMax characters.');
  } else {
    return (name: n, email: e, phone: p);
  }
  return null;
}

/// Checks the Add user form and builds the POST body.
FormResult newUserBody({
  required CreatableRole? role,
  required String name,
  required String email,
  required String phone,
}) {
  if (role == null) {
    return const FormResult.error(
      'Choose whether this is a parent or gate staff.',
    );
  }
  String? problem;
  final c = _contact(name, email, phone, (m) => problem = m);
  if (c == null) return FormResult.error(problem!);
  return FormResult.ok({
    'name': c.name,
    'email': c.email,
    'phone': c.phone,
    'role': role.value,
  });
}

/// Checks the edit form and returns only the fields that changed (the PATCH
/// body). An empty body means nothing changed.
FormResult userChanges(
  SchoolUser user, {
  required String name,
  required String email,
  required String phone,
}) {
  String? problem;
  final c = _contact(name, email, phone, (m) => problem = m);
  if (c == null) return FormResult.error(problem!);
  return FormResult.ok({
    if (c.name != user.name) 'name': c.name,
    if (c.email != user.email) 'email': c.email,
    if (c.phone != user.phone) 'phone': c.phone,
  });
}

/// What to tell the admin after a set-password email. "Sent" means the email
/// service accepted it, so the message never promises it reached the inbox.
String setupLinkMessage({
  required String name,
  required String email,
  required bool sent,
}) => sent
    ? 'A set-password link was sent to $email. It works once, for 30 minutes.'
    : 'The set-password link could not be emailed to $name. Check their email '
          'address and try again, or ask them to use "Forgot password?" on the '
          'sign-in page.';
