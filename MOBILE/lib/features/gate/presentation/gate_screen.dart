import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/qr_scanner.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/error_text.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/photo_avatar.dart';
import '../data/gate_repository.dart';
import '../domain/gate.dart';

/// Gate verification (SRS 11, 18.6): check a pickup code, confirm the person
/// in front of you matches, then release. A failed check never releases.
class GateScreen extends StatefulWidget {
  const GateScreen({super.key, required this.gate, required this.scanner});

  final GateRepository gate;
  final QrScanner scanner;

  @override
  State<GateScreen> createState() => _GateScreenState();
}

sealed class _Step {
  const _Step();
}

class _Enter extends _Step {
  const _Enter();
}

class _Verified extends _Step {
  const _Verified(this.request, this.pupil, this.picker);
  final GateRequest request;
  final GatePupil pupil;
  final GatePicker picker;
}

class _Failed extends _Step {
  const _Failed(this.result);
  final CheckResult result;
}

class _Released extends _Step {
  const _Released(this.pupil, this.picker, this.at);
  final GatePupil pupil;
  final GatePicker picker;
  final DateTime at;
}

class _Refused extends _Step {
  const _Refused(this.pupil);
  final GatePupil pupil;
}

class _GateScreenState extends State<GateScreen> {
  _Step _step = const _Enter();

  void _go(_Step step) {
    FocusScope.of(context).unfocus();
    setState(() => _step = step);
  }

  @override
  Widget build(BuildContext context) {
    final step = _step;
    return Scaffold(
      appBar: AppBar(title: const Text('Gate')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: switch (step) {
                _Enter() => _CodeEntry(
                  gate: widget.gate,
                  scanner: widget.scanner,
                  onResult: _go,
                ),
                _Verified() => _ConfirmRelease(
                  gate: widget.gate,
                  step: step,
                  onResult: _go,
                ),
                _Failed() => _FailedView(
                  result: step.result,
                  onNext: () => _go(const _Enter()),
                ),
                _Released() => _ReleasedView(
                  step: step,
                  onNext: () => _go(const _Enter()),
                ),
                _Refused() => _RefusedView(
                  pupil: step.pupil,
                  onNext: () => _go(const _Enter()),
                ),
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _CodeEntry extends StatefulWidget {
  const _CodeEntry({
    required this.gate,
    required this.scanner,
    required this.onResult,
  });

  final GateRepository gate;
  final QrScanner scanner;
  final void Function(_Step) onResult;

  @override
  State<_CodeEntry> createState() => _CodeEntryState();
}

class _CodeEntryState extends State<_CodeEntry> {
  final _controller = TextEditingController();
  bool _checking = false;
  bool _scanning = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final typed = normaliseCode(_controller.text);
    if (typed.error != null) {
      setState(() => _error = typed.error);
      return;
    }
    await _verify(GateRequest.manual(typed.code!));
  }

  void _scanned(String text) {
    final qr = parseQrData(text);
    setState(() {
      _scanning = false;
      _error = qr.error;
    });
    if (qr.qrData != null) _verify(GateRequest.qr(qr.qrData!));
  }

  void _cameraFailed(String message) {
    setState(() {
      _scanning = false;
      _error = message;
    });
  }

  Future<void> _verify(GateRequest request) async {
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      final outcome = await widget.gate.verify(request);
      if (!mounted) return;
      if (outcome.verified) {
        widget.onResult(_Verified(request, outcome.pupil!, outcome.picker!));
      } else {
        widget.onResult(_Failed(outcome.result));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _checking = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_scanning) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Scan the QR code', style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text(
            "Point the camera at the QR code in the parent's Pikva app.",
            style: TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 16),
          AspectRatio(
            aspectRatio: 1,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: ColoredBox(
                color: Colors.black,
                child: widget.scanner.build(
                  context,
                  onScan: _scanned,
                  onError: _cameraFailed,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () => setState(() => _scanning = false),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Cancel'),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Check a pickup code', style: theme.textTheme.titleLarge),
        const SizedBox(height: 4),
        const Text(
          'Scan the QR code, or type the 8-character code the person shows you.',
          style: TextStyle(color: AppColors.inkMuted),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _controller,
          enabled: !_checking,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          textInputAction: TextInputAction.done,
          autocorrect: false,
          enableSuggestions: false,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9 \-]')),
            LengthLimitingTextInputFormatter(24),
          ],
          onSubmitted: (_) => _checking ? null : _check(),
          style: theme.textTheme.headlineSmall?.copyWith(
            fontFamily: 'monospace',
            letterSpacing: 4,
          ),
          textAlign: TextAlign.center,
          decoration: const InputDecoration(
            labelText: 'Pickup code',
            hintText: 'ABCD 2345',
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          _Banner(
            color: AppColors.danger50,
            text: _error!,
            fg: AppColors.danger600,
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _checking ? null : _check,
          child: _checking
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Check code'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _checking
              ? null
              : () => setState(() {
                  _scanning = true;
                  _error = null;
                }),
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Scan QR code'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(56),
          ),
        ),
      ],
    );
  }
}

class _ConfirmRelease extends StatefulWidget {
  const _ConfirmRelease({
    required this.gate,
    required this.step,
    required this.onResult,
  });

  final GateRepository gate;
  final _Verified step;
  final void Function(_Step) onResult;

  @override
  State<_ConfirmRelease> createState() => _ConfirmReleaseState();
}

class _ConfirmReleaseState extends State<_ConfirmRelease> {
  // Started once, so redrawing the screen never fetches the photos again.
  late final Future<Uint8List?> _pupilPhoto = widget.gate.pupilPhoto(
    widget.step.pupil,
  );
  late final Future<Uint8List?> _pickerPhoto = widget.gate.pickerPhoto(
    widget.step.picker,
  );

  bool _releasing = false;
  bool _refusing = false;
  bool _confirmingRefusal = false;
  String? _error;

  bool get _busy => _releasing || _refusing;

  Future<void> _release() async {
    if (_busy) return;
    setState(() {
      _releasing = true;
      _error = null;
    });
    try {
      final outcome = await widget.gate.release(widget.step.request);
      if (!mounted) return;
      if (outcome.released) {
        widget.onResult(
          _Released(widget.step.pupil, widget.step.picker, outcome.releasedAt!),
        );
      } else {
        // The code may have been used at another gate, or expired, since the
        // check.
        widget.onResult(_Failed(outcome.result));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _releasing = false;
      });
    }
  }

  // SRS 11.4: the code is cancelled and the school alerted.
  Future<void> _refuse() async {
    if (_busy) return;
    setState(() {
      _refusing = true;
      _error = null;
    });
    try {
      final outcome = await widget.gate.refuse(widget.step.request);
      if (!mounted) return;
      widget.onResult(
        outcome.refused ? _Refused(widget.step.pupil) : _Failed(outcome.result),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _refusing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pupil = widget.step.pupil;
    final picker = widget.step.picker;
    return _ResultCard(
      color: AppColors.success600,
      header: const _Header(
        title: 'Code valid',
        subtitle: 'Check the person in front of you matches before releasing.',
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Person(
            label: 'Pupil',
            name: pupil.fullName,
            initials: _initials(pupil.firstName, pupil.lastName),
            photo: _pupilPhoto,
          ),
          const SizedBox(height: 16),
          _Person(
            label: 'Pickup person',
            name: picker.name,
            detail: picker.relationship,
            initials: _initials(picker.name, ''),
            photo: _pickerPhoto,
          ),
          const Divider(height: 32),
          if (_error != null) ...[
            _Banner(
              color: AppColors.danger50,
              text: _error!,
              fg: AppColors.danger600,
            ),
            const SizedBox(height: 12),
          ],
          if (_confirmingRefusal) ...[
            _Banner(
              color: AppColors.danger50,
              fg: AppColors.ink,
              text:
                  'Refuse this pickup? ${pupil.firstName} stays at school, '
                  'the code is cancelled and the school is alerted.',
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _refuse,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.danger600,
              ),
              child: Text(_refusing ? 'Refusing…' : 'Refuse pickup'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => setState(() => _confirmingRefusal = false),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Cancel'),
            ),
          ] else ...[
            FilledButton(
              onPressed: _busy ? null : _release,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.success600,
                minimumSize: const Size.fromHeight(56),
              ),
              child: Text(
                _releasing ? 'Releasing…' : 'Release ${pupil.firstName}',
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() => _confirmingRefusal = true),
              style: TextButton.styleFrom(foregroundColor: AppColors.danger600),
              child: const Text("Don't release — this is not the right person"),
            ),
          ],
        ],
      ),
    );
  }
}

class _FailedView extends StatelessWidget {
  const _FailedView({required this.result, required this.onNext});

  final CheckResult result;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final text = failureText(result);
    return _ResultCard(
      color: AppColors.danger600,
      header: _Header(eyebrow: 'Do not release', title: text.title),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(text.detail),
          const SizedBox(height: 8),
          const Text(
            'This attempt has been recorded as a security alert for the '
            'school.',
            style: TextStyle(color: AppColors.inkMuted, fontSize: 12),
          ),
          _NextButton(onNext: onNext),
        ],
      ),
    );
  }
}

class _RefusedView extends StatelessWidget {
  const _RefusedView({required this.pupil, required this.onNext});

  final GatePupil pupil;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return _ResultCard(
      color: AppColors.danger600,
      header: const _Header(eyebrow: 'Do not release', title: 'Pickup refused'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${pupil.firstName} stays at school. The code has been cancelled '
            'and the school has been alerted.',
          ),
          _NextButton(onNext: onNext),
        ],
      ),
    );
  }
}

class _ReleasedView extends StatelessWidget {
  const _ReleasedView({required this.step, required this.onNext});

  final _Released step;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return _ResultCard(
      color: AppColors.success600,
      header: _Header(
        title: '${step.pupil.firstName} released',
        subtitle:
            'To ${step.picker.name} at ${formatTime(step.at)}. The release '
            'has been recorded.',
      ),
      child: _NextButton(onNext: onNext),
    );
  }
}

class _NextButton extends StatelessWidget {
  const _NextButton({required this.onNext});

  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: FilledButton(
        onPressed: onNext,
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        child: const Text('Next pickup'),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    required this.color,
    required this.header,
    required this.child,
  });

  final Color color;
  final Widget header;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: color,
            padding: const EdgeInsets.all(16),
            child: header,
          ),
          Padding(padding: const EdgeInsets.all(16), child: child),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({this.eyebrow, required this.title, this.subtitle});

  final String? eyebrow;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eyebrow != null)
          Text(
            eyebrow!.toUpperCase(),
            style: theme.labelMedium?.copyWith(
              color: Colors.white70,
              letterSpacing: 1,
            ),
          ),
        Text(
          title,
          style: theme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (subtitle != null)
          Text(subtitle!, style: const TextStyle(color: Colors.white70)),
      ],
    );
  }
}

class _Person extends StatelessWidget {
  const _Person({
    required this.label,
    required this.name,
    required this.initials,
    required this.photo,
    this.detail,
  });

  final String label;
  final String name;
  final String? detail;
  final String initials;
  final Future<Uint8List?> photo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return FutureBuilder<Uint8List?>(
      future: photo,
      builder: (context, snap) {
        final loaded = snap.connectionState == ConnectionState.done;
        final hasPhoto = snap.data != null;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PhotoAvatar(initials: initials, photo: photo, radius: 44),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label.toUpperCase(),
                    style: theme.labelSmall?.copyWith(
                      color: AppColors.inkMuted,
                      letterSpacing: 1,
                    ),
                  ),
                  Text(name, style: theme.titleLarge),
                  if (detail != null)
                    Text(
                      detail!,
                      style: const TextStyle(color: AppColors.inkMuted),
                    ),
                  if (loaded && !hasPhoto)
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: Text(
                        'No photo — check their identity another way.',
                        style: TextStyle(
                          color: AppColors.warning600,
                          fontSize: 12,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.color, required this.text, required this.fg});

  final Color color;
  final Color fg;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: TextStyle(color: fg)),
    );
  }
}

String _initials(String first, String last) {
  final a = first.trim().isEmpty ? '' : first.trim()[0];
  final b = last.trim().isEmpty ? '' : last.trim()[0];
  return (a + b).toUpperCase();
}
