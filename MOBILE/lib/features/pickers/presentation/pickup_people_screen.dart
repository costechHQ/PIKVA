import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/photo_avatar.dart';
import '../../pupils/data/pupil_repository.dart';
import '../../pupils/domain/pupil.dart';
import '../../pupils/presentation/pupil_avatar.dart';
import '../data/picker_repository.dart';
import '../domain/pickup_person.dart';

class PickupPeopleScreen extends StatefulWidget {
  const PickupPeopleScreen({
    super.key,
    required this.pupils,
    required this.pickers,
  });

  final PupilRepository pupils;
  final PickerRepository pickers;

  @override
  State<PickupPeopleScreen> createState() => _PickupPeopleScreenState();
}

class _PickupPeopleScreenState extends State<PickupPeopleScreen> {
  bool _loading = true;
  Object? _error;
  List<Pupil> _pupils = const [];
  List<PickupPerson> _people = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.pupils.list(),
        widget.pickers.list(),
      ]);
      if (!mounted) return;
      setState(() {
        _pupils = results[0] as List<Pupil>;
        _people = results[1] as List<PickupPerson>;
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

  void _replace(PickupPerson updated) {
    setState(() {
      _people = [for (final p in _people) p.id == updated.id ? updated : p];
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pickup people')),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ErrorView(error: _error!, onRetry: _retry);
    if (_pupils.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No children yet. Your school adds your children to Pikva.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          for (final pupil in _pupils) ...[
            _PupilHeader(pupil: pupil, repository: widget.pupils),
            const SizedBox(height: 12),
            ..._peopleFor(pupil),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }

  List<Widget> _peopleFor(Pupil pupil) {
    final people = _people.where((p) => p.pupilId == pupil.id).toList();
    if (people.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'No pickup people for ${pupil.firstName} yet.',
            style: const TextStyle(color: AppColors.inkMuted),
          ),
        ),
      ];
    }
    return [
      for (final person in people)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _PersonCard(
            key: ValueKey(person.id),
            person: person,
            pupil: pupil,
            repository: widget.pickers,
            onChanged: _replace,
          ),
        ),
    ];
  }
}

class _PupilHeader extends StatelessWidget {
  const _PupilHeader({required this.pupil, required this.repository});

  final Pupil pupil;
  final PupilRepository repository;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        PupilAvatar(pupil: pupil, repository: repository, radius: 18),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            pupil.fullName,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
      ],
    );
  }
}

class _PersonCard extends StatefulWidget {
  const _PersonCard({
    super.key,
    required this.person,
    required this.pupil,
    required this.repository,
    required this.onChanged,
  });

  final PickupPerson person;
  final Pupil pupil;
  final PickerRepository repository;
  final void Function(PickupPerson) onChanged;

  @override
  State<_PersonCard> createState() => _PersonCardState();
}

class _PersonCardState extends State<_PersonCard> {
  bool _busy = false;
  String? _error;

  Future<void> _setActive(bool active) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await widget.repository.setActive(
        widget.person.id,
        active: active,
      );
      if (!mounted) return;
      widget.onChanged(updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDeactivate() async {
    final person = widget.person;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Deactivate ${person.name}?'),
        content: Text(
          'They will not be able to collect ${widget.pupil.firstName} until '
          'you activate them again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger600),
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );
    if (ok == true) await _setActive(false);
  }

  @override
  Widget build(BuildContext context) {
    final person = widget.person;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                PhotoAvatar(
                  initials: person.initials,
                  photo: person.hasPhoto
                      ? widget.repository.photo(person)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(person.name, style: theme.textTheme.titleMedium),
                      Text(
                        '${person.relationship} · ${person.type}',
                        style: const TextStyle(color: AppColors.inkMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _StatusBadge(person.status),
              ],
            ),
            const SizedBox(height: 12),
            _Detail(label: 'Phone', value: person.phone),
            _Detail(label: 'From', value: formatDateTime(person.startsAt)),
            _Detail(label: 'Until', value: formatDateTime(person.expiresAt)),
            if (person.status == PersonStatus.pendingApproval) ...[
              const SizedBox(height: 12),
              _Note(
                color: AppColors.warning50,
                text:
                    'Waiting for your school to approve ${person.name}. '
                    'You can get a pickup code once they do.',
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              _Note(color: AppColors.danger50, text: _error!),
            ],
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: person.isActive
                  ? OutlinedButton(
                      onPressed: _busy ? null : _confirmDeactivate,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger600,
                      ),
                      child: Text(_busy ? 'Working…' : 'Deactivate'),
                    )
                  : FilledButton(
                      onPressed: _busy ? null : () => _setActive(true),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 40),
                      ),
                      child: Text(_busy ? 'Working…' : 'Activate'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});

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
            width: 56,
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

class _Note extends StatelessWidget {
  const _Note({required this.color, required this.text});

  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge(this.status);

  final PersonStatus status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      PersonStatus.active => (AppColors.success50, AppColors.success600),
      PersonStatus.pendingApproval => (
        AppColors.warning50,
        AppColors.warning600,
      ),
      PersonStatus.scheduled => (AppColors.brand50, AppColors.brand700),
      PersonStatus.expired => (AppColors.danger50, AppColors.danger600),
      PersonStatus.inactive => (AppColors.line, AppColors.inkMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.label,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}
