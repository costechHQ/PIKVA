import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/error_text.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/account_rules.dart';

/// Edit name and phone. Pops `true` when saved.
class EditDetailsScreen extends StatefulWidget {
  const EditDetailsScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<EditDetailsScreen> createState() => _EditDetailsScreenState();
}

class _EditDetailsScreenState extends State<EditDetailsScreen> {
  late final TextEditingController _name = TextEditingController(
    text: widget.auth.user!.name,
  );
  late final TextEditingController _phone = TextEditingController(
    text: widget.auth.user!.phone,
  );
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final result = ownDetailsChanges(
      widget.auth.user!,
      name: _name.text,
      phone: _phone.text,
    );
    if (!result.isOk) {
      setState(() => _error = result.error);
      return;
    }
    final changes = result.body!;
    if (changes.isEmpty) {
      Navigator.pop(context); // nothing to save
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.updateDetails(changes);
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit details')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _name,
              enabled: !_busy,
              maxLength: nameMax,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.name],
              decoration: const InputDecoration(
                labelText: 'Full name',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phone,
              enabled: !_busy,
              maxLength: phoneMax,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              decoration: const InputDecoration(
                labelText: 'Phone number',
                counterText: '',
              ),
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
                  : const Text('Save changes'),
            ),
          ],
        ),
      ),
    );
  }
}
