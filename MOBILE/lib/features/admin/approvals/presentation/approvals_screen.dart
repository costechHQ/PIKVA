import 'package:flutter/material.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../../shared/widgets/photo_avatar.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pickers/domain/pickup_person.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../../../pupils/presentation/pupil_avatar.dart';
import '../domain/approval_request.dart';

/// Pickup people that parents added or changed, waiting for the school's
/// approval (SRS 9.2). They cannot collect until approved.
class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({
    super.key,
    required this.pupils,
    required this.pickers,
  });

  final PupilRepository pupils;
  final PickerRepository pickers;

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  bool _loading = true;
  Object? _error;
  List<ApprovalRequest> _requests = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (people, pupils) = await (
        widget.pickers.list(),
        widget.pupils.list(),
      ).wait;
      if (!mounted) return;
      setState(() {
        _requests = pendingApprovals(people, pupils);
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  void _retry() {
    setState(() {
      _loading = true;
      _error = null;
    });
    _load();
  }

  void _handled(int id, String message) {
    setState(() {
      _requests = [
        for (final r in _requests)
          if (r.person.id != id) r,
      ];
    });
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Approvals')),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ErrorView(error: _error!, onRetry: _retry);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Pickup people added or changed by parents. They cannot collect '
            'until you approve them.',
            style: TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 16),
          if (_requests.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Text(
                'Nothing waiting for approval. When a parent adds a pickup '
                'person or changes one, they appear here.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.inkMuted),
              ),
            )
          else
            for (final request in _requests)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _RequestCard(
                  key: ValueKey(request.person.id),
                  request: request,
                  pickers: widget.pickers,
                  pupils: widget.pupils,
                  onHandled: _handled,
                ),
              ),
        ],
      ),
    );
  }
}

class _RequestCard extends StatefulWidget {
  const _RequestCard({
    super.key,
    required this.request,
    required this.pickers,
    required this.pupils,
    required this.onHandled,
  });

  final ApprovalRequest request;
  final PickerRepository pickers;
  final PupilRepository pupils;
  final void Function(int id, String message) onHandled;

  @override
  State<_RequestCard> createState() => _RequestCardState();
}

enum _Busy { approve, decline }

class _RequestCardState extends State<_RequestCard> {
  _Busy? _busy;
  bool _confirmingDecline = false;
  String? _error;

  PickupPerson get _person => widget.request.person;
  String get _pupilText => widget.request.pupil?.fullName ?? 'this pupil';

  Future<void> _approve() async {
    setState(() {
      _busy = _Busy.approve;
      _error = null;
    });
    try {
      await widget.pickers.approve(_person);
      if (!mounted) return;
      widget.onHandled(
        _person.id,
        '${_person.name} approved. They can now collect $_pupilText.',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _busy = null;
      });
    }
  }

  // Refusing is deactivating (SRS 9.2); the parent sees them as inactive.
  Future<void> _decline() async {
    setState(() {
      _busy = _Busy.decline;
      _error = null;
    });
    try {
      await widget.pickers.setActive(_person.id, active: false);
      if (!mounted) return;
      widget.onHandled(_person.id, '${_person.name} declined and deactivated.');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _busy = null;
        _confirmingDecline = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final person = _person;
    final pupil = widget.request.pupil;
    final parent = pupil?.parent;
    final busy = _busy != null;
    final theme = Theme.of(context).textTheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Larger than other avatars: the admin is judging who this
                // person is.
                PhotoAvatar(
                  initials: person.initials,
                  photo: person.hasPhoto ? widget.pickers.photo(person) : null,
                  radius: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(person.name, style: theme.titleMedium),
                      Text(
                        '${person.relationship} · ${person.type}',
                        style: const TextStyle(color: AppColors.inkMuted),
                      ),
                      if (!person.hasPhoto)
                        const Text(
                          'No photo',
                          style: TextStyle(
                            color: AppColors.warning600,
                            fontSize: 12,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (pupil != null) ...[
                        PupilAvatar(
                          pupil: pupil,
                          repository: widget.pupils,
                          radius: 16,
                        ),
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                        child: Text.rich(
                          TextSpan(
                            children: [
                              const TextSpan(text: 'Would collect '),
                              TextSpan(
                                text: _pupilText,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (parent != null) ...[
                    const SizedBox(height: 8),
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: 'Sent by ',
                            style: TextStyle(color: AppColors.inkMuted),
                          ),
                          TextSpan(
                            text: parent.name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    SelectableText(
                      parent.phone,
                      style: const TextStyle(
                        color: AppColors.brand600,
                        fontSize: 12,
                      ),
                    ),
                    SelectableText(
                      parent.email,
                      style: const TextStyle(
                        color: AppColors.brand600,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            _Detail('Phone', person.phone),
            _Detail('From', formatDateTime(person.startsAt)),
            _Detail('Until', formatDateTime(person.expiresAt)),
            _Detail('Sent', formatDateTime(person.updatedAt)),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.danger50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$_error\nIf the details changed, pull down to refresh and '
                  'review them again.',
                  style: const TextStyle(color: AppColors.danger600),
                ),
              ),
            ],
            const SizedBox(height: 12),
            if (_confirmingDecline) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.danger50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Decline ${person.name}? They will be deactivated and cannot '
                  'collect $_pupilText. The parent can ask again by '
                  'activating them.',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: busy ? null : _decline,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.danger600,
                        minimumSize: const Size(0, 44),
                      ),
                      child: Text(
                        _busy == _Busy.decline ? 'Declining…' : 'Decline',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy
                          ? null
                          : () => setState(() => _confirmingDecline = false),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                ],
              ),
            ] else
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: busy ? null : _approve,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 44),
                      ),
                      child: Text(
                        _busy == _Busy.approve ? 'Approving…' : 'Approve',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy
                          ? null
                          : () => setState(() => _confirmingDecline = true),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger600,
                        minimumSize: const Size(0, 44),
                      ),
                      child: const Text('Decline'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 64,
            child: Text(
              label,
              style: const TextStyle(color: AppColors.inkMuted),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
