import '../../../shared/form_result.dart';
import '../../auth/domain/current_user.dart';

const nameMax = 150;
const phoneMax = 30;
const passwordMax = 128;

/// Checks the details form. The body holds only what changed, because
/// `PATCH /auth/me` takes just the fields to change (never the email).
FormResult ownDetailsChanges(
  CurrentUser current, {
  required String name,
  required String phone,
}) {
  final n = name.trim();
  final p = phone.trim();
  if (n.isEmpty) return const FormResult.error('Enter your full name.');
  if (n.length > nameMax) {
    return const FormResult.error(
      'Your name can be at most $nameMax characters.',
    );
  }
  if (p.isEmpty) return const FormResult.error('Enter your phone number.');
  if (p.length > phoneMax) {
    return const FormResult.error(
      'The phone number can be at most $phoneMax characters.',
    );
  }
  return FormResult.ok({
    if (n != current.name) 'name': n,
    if (p != current.phone) 'phone': p,
  });
}

/// Checks the change-password form; same rules and messages as the web app.
FormResult? passwordProblem({
  required String current,
  required String next,
  required String confirm,
}) {
  if (current.isEmpty) {
    return const FormResult.error('Enter your current password.');
  }
  if (next.trim().isEmpty) {
    return const FormResult.error('Enter a new password.');
  }
  if (next.length > passwordMax) {
    return const FormResult.error(
      'The new password can be at most $passwordMax characters.',
    );
  }
  if (next == current) {
    return const FormResult.error(
      'The new password must be different from your current one.',
    );
  }
  if (next != confirm) {
    return const FormResult.error('The two new passwords do not match.');
  }
  return null;
}
