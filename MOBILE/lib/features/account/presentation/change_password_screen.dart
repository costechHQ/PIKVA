import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/error_text.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/account_rules.dart';

/// Change the password while signed in. Pops `true` when changed. The
/// server signs out every other session and gives this one a new token.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final problem = passwordProblem(
      current: _current.text,
      next: _next.text,
      confirm: _confirm.text,
    );
    if (problem != null) {
      setState(() => _error = problem.error);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.changePassword(_current.text, _next.text);
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = switch (e.kind) {
          // Wrong current password is a 400; keep the server's wording.
          ApiErrorKind.validation => 'Check the passwords and try again.',
          _ => errorText(e),
        };
        _busy = false;
      });
    }
  }

  InputDecoration _decoration(String label, {bool toggle = false}) {
    return InputDecoration(
      labelText: label,
      suffixIcon: toggle
          ? IconButton(
              tooltip: _hide ? 'Show passwords' : 'Hide passwords',
              icon: Icon(
                _hide
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
              onPressed: () => setState(() => _hide = !_hide),
            )
          : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Change password')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'You will stay signed in here and be signed out on your other '
              'devices.',
              style: TextStyle(color: AppColors.inkMuted),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _current,
              enabled: !_busy,
              obscureText: _hide,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.password],
              decoration: _decoration('Current password', toggle: true),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _next,
              enabled: !_busy,
              obscureText: _hide,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.newPassword],
              decoration: _decoration('New password'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _confirm,
              enabled: !_busy,
              obscureText: _hide,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _busy ? null : _save(),
              autofillHints: const [AutofillHints.newPassword],
              decoration: _decoration('Confirm new password'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.danger50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.danger600),
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Change password'),
            ),
          ],
        ),
      ),
    );
  }
}
