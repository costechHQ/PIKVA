import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/photo_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../history/data/release_repository.dart';
import '../../../history/domain/release.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pickers/domain/pickup_person.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../../../pupils/domain/pupil.dart';
import '../../../pupils/presentation/pupil_avatar.dart';
import '../../users/data/user_repository.dart';
import 'pupil_form_screen.dart';

/// How many recent pickups the pupil page lists.
const pupilRecentReleases = 10;

/// One pupil for admins (SRS 18.4): details, parent contact, pickup people
/// and recent pickups.
class AdminPupilDetailScreen extends StatefulWidget {
  const AdminPupilDetailScreen({
    super.key,
    required this.pupilId,
    required this.pupils,
    required this.pickers,
    required this.releases,
    required this.users,
    required this.photoPicker,
  });

  final int pupilId;
  final PupilRepository pupils;
  final PickerRepository pickers;
  final ReleaseRepository releases;
  final UserRepository users;
  final PhotoPicker photoPicker;

  @override
  State<AdminPupilDetailScreen> createState() => _AdminPupilDetailScreenState();
}

class _AdminPupilDetailScreenState extends State<AdminPupilDetailScreen> {
  bool _loading = true;
  Object? _error;
  Pupil? _pupil;
  List<PickupPerson> _people = const [];
  List<Release> _releases = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (pupil, people, releases) = await (
        widget.pupils.get(widget.pupilId),
        widget.pickers.list(pupilId: widget.pupilId),
        widget.releases.latest(pupilRecentReleases, pupilId: widget.pupilId),
      ).wait;
      if (!mounted) return;
      setState(() {
        _pupil = pupil;
        _people = people;
        _releases = releases;
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

  Future<void> _edit() async {
    final pupil = _pupil!;
    final saved = await Navigator.of(context).push<Pupil>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => PupilFormScreen(
          pupils: widget.pupils,
          users: widget.users,
          photoPicker: widget.photoPicker,
          original: pupil,
          onStored: (p) => setState(() => _pupil = p),
        ),
      ),
    );
    if (saved == null || !mounted) return;
    setState(() => _pupil = saved);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('Saved changes to ${saved.fullName}.')),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_pupil?.fullName ?? 'Pupil'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/admin/more/pupils'),
        ),
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null || _pupil == null) {
      return ErrorView(error: _error ?? 'Not found', onRetry: _retry);
    }
    final pupil = _pupil!;
    final parent = pupil.parent;
    final waiting = _people
        .where((p) => p.status == PersonStatus.pendingApproval)
        .length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: PupilAvatar(
              pupil: pupil,
              repository: widget.pupils,
              radius: 56,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            pupil.fullName,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(
            'Born ${formatDate(pupil.dateOfBirth)} · '
            '${pupil.ageOn(DateTime.now())} years',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 12),
          Center(
            child: OutlinedButton(
              onPressed: _edit,
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
              child: const Text('Edit pupil'),
            ),
          ),
          if (parent != null) ...[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Parent',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(parent.name),
                    SelectableText(
                      parent.phone,
                      style: const TextStyle(color: AppColors.brand600),
                    ),
                    SelectableText(
                      parent.email,
                      style: const TextStyle(color: AppColors.brand600),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          _Section(
            title: 'Pickup people',
            empty: 'No pickup people for ${pupil.firstName} yet.',
            note: waiting == 0
                ? null
                : '$waiting waiting for school approval. They cannot collect '
                      'until approved.',
            children: [
              for (final p in _people)
                _Line(
                  title: p.name,
                  subtitle: '${p.relationship} · ${p.type}',
                  trailing: p.status.label,
                ),
            ],
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Recent pickups',
            empty: 'No pickups recorded yet.',
            children: [
              for (final r in _releases)
                _Line(
                  title: 'By ${r.pickerName}',
                  subtitle:
                      '${formatDateTime(r.releasedAt)} · ${r.methodLabel}'
                      '${r.verifiedByName == null ? '' : ' · released by ${r.verifiedByName}'}',
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.empty,
    required this.children,
    this.note,
  });

  final String title;
  final String empty;
  final List<Widget> children;
  final String? note;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            if (note != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Text(
                  note!,
                  style: const TextStyle(color: AppColors.warning600),
                ),
              ),
            if (children.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text(
                  empty,
                  style: const TextStyle(color: AppColors.inkMuted),
                ),
              )
            else
              ...children,
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.title, required this.subtitle, this.trailing});

  final String title;
  final String subtitle;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null)
            Text(
              trailing!,
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
            ),
        ],
      ),
    );
  }
}
