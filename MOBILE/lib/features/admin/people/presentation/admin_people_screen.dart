import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/photo_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../../shared/widgets/photo_avatar.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pickers/domain/pickup_person.dart';
import '../../../pickers/presentation/person_form_screen.dart';
import '../../../pickers/presentation/status_badge.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../domain/person_rows.dart';

/// Every pickup person in the school for admins (SRS 18.5): filter by
/// status, search, edit, deactivate and activate. Approving is on the
/// Approvals tab; only parents add people or change photos.
class AdminPeopleScreen extends StatefulWidget {
  const AdminPeopleScreen({
    super.key,
    required this.pupils,
    required this.pickers,
    required this.photoPicker,
  });

  final PupilRepository pupils;
  final PickerRepository pickers;
  final PhotoPicker photoPicker;

  @override
  State<AdminPeopleScreen> createState() => _AdminPeopleScreenState();
}

class _AdminPeopleScreenState extends State<AdminPeopleScreen> {
  final _search = TextEditingController();
  bool _loading = true;
  Object? _error;
  List<PersonRow> _rows = const [];
  StatusFilter _filter = StatusFilter.all;

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
      final (people, pupils) = await (
        widget.pickers.list(),
        widget.pupils.list(),
      ).wait;
      if (!mounted) return;
      setState(() {
        _rows = personRows(people, pupils);
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
      _rows = [
        for (final r in _rows)
          r.person.id == updated.id ? PersonRow(updated, r.pupil) : r,
      ];
    });
  }

  void _tell(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _edit(PersonRow row) async {
    final saved = await showPersonForm(
      context,
      repository: widget.pickers,
      photoPicker: widget.photoPicker,
      pupils: [if (row.pupil != null) row.pupil!],
      original: row.person,
      adminEdit: true,
    );
    if (saved == null || !mounted) return;
    _replace(saved);
    _tell('Saved changes to ${saved.name}.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pickup people'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/admin/more'),
        ),
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ErrorView(error: _error!, onRetry: _retry);

    final query = _search.text.trim();
    final shown = filterPersonRows(_rows, _filter, query);
    final counts = statusCounts(_rows);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final f in StatusFilter.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(
                        f.status == null
                            ? 'All (${_rows.length})'
                            : '${f.label} (${counts[f.status] ?? 0})',
                      ),
                      selected: f == _filter,
                      onSelected: (_) => setState(() => _filter = f),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Search by person, phone or pupil',
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
          const SizedBox(height: 12),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Text(
                query.isNotEmpty || _filter.status != null
                    ? 'No pickup people match this filter.'
                    : 'No pickup people yet. Parents add them from their '
                          'account.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            )
          else
            for (final row in shown)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _PersonCard(
                  key: ValueKey(row.person.id),
                  row: row,
                  pickers: widget.pickers,
                  onEdit: () => _edit(row),
                  onChanged: _replace,
                  onNotice: _tell,
                ),
              ),
        ],
      ),
    );
  }
}

class _PersonCard extends StatefulWidget {
  const _PersonCard({
    super.key,
    required this.row,
    required this.pickers,
    required this.onEdit,
    required this.onChanged,
    required this.onNotice,
  });

  final PersonRow row;
  final PickerRepository pickers;
  final VoidCallback onEdit;
  final void Function(PickupPerson) onChanged;
  final void Function(String) onNotice;

  @override
  State<_PersonCard> createState() => _PersonCardState();
}

class _PersonCardState extends State<_PersonCard> {
  bool _busy = false;
  bool _confirming = false;
  String? _error;

  PickupPerson get _person => widget.row.person;

  Future<void> _setActive(bool active) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await widget.pickers.setActive(
        _person.id,
        active: active,
      );
      if (!mounted) return;
      setState(() => _confirming = false);
      widget.onChanged(updated);
      widget.onNotice(
        '${_person.name} ${active ? 'activated' : 'deactivated'}.',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final person = _person;
    final pupil = widget.row.pupil;
    final pupilText = pupil?.fullName ?? 'the pupil';
    final theme = Theme.of(context).textTheme;

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
                  photo: person.hasPhoto ? widget.pickers.photo(person) : null,
                  radius: 24,
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
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                StatusBadge(person.status),
              ],
            ),
            const SizedBox(height: 12),
            _Detail(
              'Collects',
              pupil == null ? 'Unknown pupil' : pupil.fullName,
              onTap: pupil == null
                  ? null
                  : () => context.go('/admin/more/pupils/${pupil.id}'),
            ),
            _Detail('Phone', person.phone, selectable: true),
            _Detail('From', formatDateTime(person.startsAt)),
            _Detail('Until', formatDateTime(person.expiresAt)),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger600)),
            ],
            const SizedBox(height: 12),
            if (_confirming) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.danger50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Deactivate ${person.name}? They cannot collect $pupilText, '
                  'even with a code already issued.',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : () => _setActive(false),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.danger600,
                        minimumSize: const Size(0, 44),
                      ),
                      child: Text(_busy ? 'Deactivating…' : 'Deactivate'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() => _confirming = false),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                ],
              ),
            ] else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: _busy ? null : widget.onEdit,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 40),
                    ),
                    child: const Text('Edit'),
                  ),
                  if (person.isActive)
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() => _confirming = true),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger600,
                        minimumSize: const Size(0, 40),
                      ),
                      child: const Text('Deactivate'),
                    )
                  else
                    FilledButton(
                      onPressed: _busy ? null : () => _setActive(true),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 40),
                      ),
                      child: Text(_busy ? 'Activating…' : 'Activate'),
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
  const _Detail(this.label, this.value, {this.onTap, this.selectable = false});

  final String label;
  final String value;
  final VoidCallback? onTap;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      color: onTap != null || selectable ? AppColors.brand600 : null,
      fontWeight: onTap != null ? FontWeight.w600 : null,
    );
    final Widget text = selectable
        ? SelectableText(value, style: style)
        : Text(value, style: style);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: const TextStyle(color: AppColors.inkMuted),
            ),
          ),
          Expanded(
            child: onTap == null ? text : InkWell(onTap: onTap, child: text),
          ),
        ],
      ),
    );
  }
}
