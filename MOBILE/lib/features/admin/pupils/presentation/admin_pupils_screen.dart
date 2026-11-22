import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/photo_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pickers/domain/pickup_person.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../../../pupils/domain/pupil.dart';
import '../../../pupils/presentation/pupil_avatar.dart';
import '../../users/data/user_repository.dart';
import '../domain/pupil_rules.dart';
import 'pupil_form_screen.dart';

/// School pupils for admins (SRS 18.4): search by pupil or parent name.
class AdminPupilsScreen extends StatefulWidget {
  const AdminPupilsScreen({
    super.key,
    required this.pupils,
    required this.pickers,
    required this.users,
    required this.photoPicker,
  });

  final PupilRepository pupils;
  final PickerRepository pickers;
  final UserRepository users;
  final PhotoPicker photoPicker;

  @override
  State<AdminPupilsScreen> createState() => _AdminPupilsScreenState();
}

class _AdminPupilsScreenState extends State<AdminPupilsScreen> {
  final _search = TextEditingController();
  bool _loading = true;
  Object? _error;
  List<Pupil> _pupils = const [];

  /// Active pickup people per pupil id.
  Map<int, int> _active = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final (pupils, people) = await (
        widget.pupils.list(),
        widget.pickers.list(),
      ).wait;
      if (!mounted) return;
      final active = <int, int>{};
      for (final p in people) {
        if (p.status == PersonStatus.active) {
          active[p.pupilId] = (active[p.pupilId] ?? 0) + 1;
        }
      }
      setState(() {
        _pupils = pupils;
        _active = active;
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

  void _upsert(Pupil pupil) {
    setState(() {
      final known = _pupils.any((p) => p.id == pupil.id);
      _pupils = known
          ? [for (final p in _pupils) p.id == pupil.id ? pupil : p]
          : [..._pupils, pupil];
    });
  }

  Future<void> _add() async {
    final added = await Navigator.of(context).push<Pupil>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => PupilFormScreen(
          pupils: widget.pupils,
          users: widget.users,
          photoPicker: widget.photoPicker,
          onStored: _upsert,
        ),
      ),
    );
    if (added == null || !mounted) return;
    _upsert(added);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${added.fullName} was added.')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pupils'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/admin/more'),
        ),
      ),
      floatingActionButton: _loading || _error != null
          ? null
          : FloatingActionButton.extended(
              onPressed: _add,
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Add pupil'),
            ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ErrorView(error: _error!, onRetry: _retry);

    final query = _search.text.trim();
    final shown = searchPupils(_pupils, query);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Search by pupil or parent name',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: query.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _search.clear();
                        setState(() {});
                      },
                    ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            query.isEmpty
                ? '${_pupils.length} ${_pupils.length == 1 ? 'pupil' : 'pupils'}'
                : '${shown.length} of ${_pupils.length} pupils match "$query".',
            style: const TextStyle(color: AppColors.inkMuted),
          ),
          const SizedBox(height: 12),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Text(
                query.isEmpty
                    ? 'No pupils at this school yet.'
                    : 'No pupils match this search.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            )
          else
            for (final p in shown)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _PupilCard(
                  pupil: p,
                  repository: widget.pupils,
                  activePeople: _active[p.id] ?? 0,
                  onTap: () => context.go('/admin/more/pupils/${p.id}'),
                ),
              ),
        ],
      ),
    );
  }
}

class _PupilCard extends StatelessWidget {
  const _PupilCard({
    required this.pupil,
    required this.repository,
    required this.activePeople,
    required this.onTap,
  });

  final Pupil pupil;
  final PupilRepository repository;
  final int activePeople;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final parent = pupil.parent;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              PupilAvatar(pupil: pupil, repository: repository),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      pupil.fullName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      'Born ${formatDate(pupil.dateOfBirth)}',
                      style: const TextStyle(color: AppColors.inkMuted),
                    ),
                    if (parent != null)
                      Text('${parent.name} · ${parent.phone}'),
                    Text(
                      activePeople == 0
                          ? 'No active pickup people'
                          : '$activePeople active pickup '
                                '${activePeople == 1 ? 'person' : 'people'}',
                      style: TextStyle(
                        fontSize: 12,
                        color: activePeople == 0
                            ? AppColors.warning600
                            : AppColors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
