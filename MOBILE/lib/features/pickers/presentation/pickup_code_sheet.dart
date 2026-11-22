import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../domain/pickup_code.dart';
import '../domain/pickup_person.dart';

/// Shows today's code and its QR once. The code exists only in this sheet:
/// closing it discards it, and getting it again means asking for a new one.
Future<void> showPickupCodeSheet(
  BuildContext context, {
  required PickupPerson person,
  required String pupilFirstName,
  required PickupCode code,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _PickupCodeSheet(
      person: person,
      pupilFirstName: pupilFirstName,
      code: code,
    ),
  );
}

class _PickupCodeSheet extends StatefulWidget {
  const _PickupCodeSheet({
    required this.person,
    required this.pupilFirstName,
    required this.code,
  });

  final PickupPerson person;
  final String pupilFirstName;
  final PickupCode code;

  @override
  State<_PickupCodeSheet> createState() => _PickupCodeSheetState();
}

class _PickupCodeSheetState extends State<_PickupCodeSheet> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.code.code));
    if (mounted) setState(() => _copied = true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final code = widget.code;
    final name = widget.person.name;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            "TODAY'S PICKUP CODE",
            textAlign: TextAlign.center,
            style: theme.textTheme.labelMedium?.copyWith(
              color: AppColors.brand600,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          Semantics(
            label: 'Code ${code.code.split('').join(' ')}',
            excludeSemantics: true,
            child: Text(
              formatCode(code.code),
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineMedium?.copyWith(
                fontFamily: 'monospace',
                fontWeight: FontWeight.w700,
                letterSpacing: 4,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'For $name to collect ${widget.pupilFirstName}. '
            'Works once, until ${formatDateTime(code.expiresAt)}.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          Center(
            child: Container(
              // White quiet zone around the code so scanners read it.
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.line),
              ),
              child: PickupQrCode(
                data: code.qrData,
                label: "QR code for $name's pickup code",
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Gate staff can scan this QR code or type the code above.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 12),
          Text(
            'Share it only with $name. It will not be shown again; '
            'if it is lost, get a new code.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: _copy,
                  child: Text(_copied ? 'Copied' : 'Copy code'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('Hide'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The QR code for a pickup code. [data] must be the server's `qr_data`
/// exactly, because the gate scanner parses it back.
class PickupQrCode extends StatelessWidget {
  const PickupQrCode({super.key, required this.data, required this.label});

  final String data;
  final String label;

  @override
  Widget build(BuildContext context) {
    return QrImageView(
      data: data,
      size: 200,
      backgroundColor: Colors.white,
      semanticsLabel: label,
    );
  }
}
