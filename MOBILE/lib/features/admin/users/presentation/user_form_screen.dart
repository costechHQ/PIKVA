import 'package:flutter/material.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../auth/domain/current_user.dart';
import '../data/user_repository.dart';
import '../domain/school_user.dart';

/// Add a user ([original] null) or edit one. Pops the user when done, so the
/// list behind can show them.
class UserFormScreen extends StatefulWidget {
  const UserFormScreen({super.key, required this.users, this.original});

  final UserRepository users;
  final SchoolUser? original;

  @override
  State<UserFormScreen> createState() => _UserFormScreenState();
}

class _UserFormScreenState extends State<UserFormScreen> {
  late final TextEditingController _name = TextEditingController(
    text: widget.original?.name,
  );
  late final TextEditingController _email = TextEditingController(
    text: widget.original?.email,
  );
  late final TextEditingController _phone = TextEditingController(
    text: widget.original?.phone,
  );
  CreatableRole? _role;
  bool _busy = false;
  String? _error;

  // After a successful add, this screen shows the outcome instead of the form.
  CreatedUser? _created;
  String? _linkMessage;
  bool _linkOk = false;

  bool get _editing => widget.original != null;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final result = _editing
        ? userChanges(
            widget.original!,
            name: _name.text,
            email: _email.text,
            phone: _phone.text,
          )
        : newUserBody(
            role: _role,
            name: _name.text,
            email: _email.text,
            phone: _phone.text,
          );
    if (!result.isOk) {
      setState(() => _error = result.error);
      return;
    }
    final body = result.body!;
    if (_editing && body.isEmpty) {
      Navigator.pop(context); // nothing changed, nothing to send
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_editing) {
        final saved = await widget.users.update(widget.original!.id, body);
        if (!mounted) return;
        Navigator.pop(context, saved);
      } else {
        final created = await widget.users.create(body);
        if (!mounted) return;
        setState(() {
          _created = created;
          _busy = false;
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _busy = false;
      });
    }
  }

  Future<void> _resend() async {
    final user = _created!.user;
    setState(() {
      _busy = true;
      _linkMessage = null;
    });
    try {
      final sent = await widget.users.sendSetupLink(user.id);
      if (!mounted) return;
      setState(() {
        _linkOk = sent;
        _linkMessage = setupLinkMessage(
          name: user.name,
          email: user.email,
          sent: sent,
        );
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _linkOk = false;
        _linkMessage = errorText(e);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _another() {
    _name.clear();
    _email.clear();
    _phone.clear();
    setState(() {
      _created = null;
      _linkMessage = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final created = _created;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          created != null
              ? 'User added'
              : _editing
              ? 'Edit user'
              : 'Add user',
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: created != null ? _outcome(created) : _form(),
        ),
      ),
    );
  }

  List<Widget> _outcome(CreatedUser created) {
    final user = created.user;
    final sentFirst = created.setupEmailSent;
    return [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.success50,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${user.name} added as '
              '${user.role == UserRole.gateStaff ? 'gate staff' : 'a parent'}',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(color: AppColors.success600),
            ),
            const SizedBox(height: 8),
            Text(
              sentFirst
                  ? 'A link to set their password has been sent to '
                        '${user.email}. It works once, for 30 minutes. If it '
                        "doesn't arrive or expires, use Send link on Users, or "
                        'they can use "Forgot password?" on the sign-in page.'
                  : 'The account was created, but the set-password email could '
                        'not be sent.',
            ),
            if (!sentFirst) ...[
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _busy ? null : _resend,
                child: Text(_busy ? 'Sending…' : 'Send link'),
              ),
            ],
            if (_linkMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                _linkMessage!,
                style: TextStyle(
                  color: _linkOk ? AppColors.success600 : AppColors.danger600,
                ),
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 24),
      FilledButton(onPressed: _another, child: const Text('Add another')),
      const SizedBox(height: 8),
      OutlinedButton(
        onPressed: () => Navigator.pop(context, user),
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        child: const Text('Done'),
      ),
    ];
  }

  List<Widget> _form() {
    return [
      if (!_editing) ...[
        const Text('Role', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        RadioGroup<CreatableRole>(
          groupValue: _role,
          onChanged: (v) {
            if (!_busy) setState(() => _role = v);
          },
          child: Column(
            children: [
              for (final r in CreatableRole.values)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: RadioListTile<CreatableRole>(
                    value: r,
                    enabled: !_busy,
                    title: Text(r.label),
                    subtitle: Text(r.hint),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
      TextField(
        controller: _name,
        enabled: !_busy,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.next,
        decoration: const InputDecoration(labelText: 'Full name'),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _email,
        enabled: !_busy,
        keyboardType: TextInputType.emailAddress,
        autocorrect: false,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(
          labelText: 'Email',
          helperText: _editing
              ? null
              : 'They get a link here to set their own password.',
        ),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _phone,
        enabled: !_busy,
        keyboardType: TextInputType.phone,
        textInputAction: TextInputAction.done,
        decoration: const InputDecoration(labelText: 'Phone number'),
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
            : Text(_editing ? 'Save changes' : 'Add user'),
      ),
    ];
  }
}
