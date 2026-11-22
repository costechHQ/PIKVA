import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../data/audit_repository.dart';
import '../domain/audit_record.dart';

/// The school's audit log for admins (SRS 14): who did what and when,
/// newest first, read-only.
class AuditLogScreen extends StatefulWidget {
  const AuditLogScreen({
    super.key,
    required this.audit,
    required this.pupils,
    required this.pickers,
  });

  final AuditRepository audit;
  final PupilRepository pupils;
  final PickerRepository pickers;

  @override
  State<AuditLogScreen> createState() => _AuditLogScreenState();
}

class _AuditLogScreenState extends State<AuditLogScreen> {
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  String? _moreError;

  String? _action;
  List<AuditRecord> _items = const [];
  bool _hasMore = false;
  Map<int, String> _pupilNames = const {};
  Map<int, String> _personNames = const {};

  // Bumped on every fresh load so a slow, older answer cannot overwrite the
  // results of a newer filter.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final gen = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _moreError = null;
    });
    try {
      final (page, pupilNames, personNames) = await (
        widget.audit.list(action: _action),
        // Names are a nicety: if they cannot load, records still show, with
        // numbers instead of names.
        _loadPupilNames(),
        _loadPersonNames(),
      ).wait;
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = page.records;
        _hasMore = page.hasMore;
        _pupilNames = pupilNames;
        _personNames = personNames;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || gen != _generation) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<Map<int, String>> _loadPupilNames() async {
    try {
      return {for (final p in await widget.pupils.list()) p.id: p.fullName};
    } catch (_) {
      return const {};
    }
  }

  Future<Map<int, String>> _loadPersonNames() async {
    try {
      return {for (final p in await widget.pickers.list()) p.id: p.name};
    } catch (_) {
      return const {};
    }
  }

  Future<void> _loadMore() async {
    final gen = _generation;
    setState(() {
      _loadingMore = true;
      _moreError = null;
    });
    try {
      final page = await widget.audit.list(
        action: _action,
        offset: _items.length,
      );
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = [..._items, ...page.records];
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } on ApiException catch (e) {
      if (!mounted || gen != _generation) return;
      setState(() {
        _moreError = errorText(e);
        _loadingMore = false;
      });
    }
  }

  void _select(String? action) {
    if (action == _action) return;
    _action = action;
    _start();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Audit log'),
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
    if (_error != null) return ErrorView(error: _error!, onRetry: _start);
    return RefreshIndicator(
      onRefresh: _start,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<String?>(
            initialValue: _action,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Filter by action'),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('All actions'),
              ),
              for (final e in actionLabels.entries)
                DropdownMenuItem<String?>(value: e.key, child: Text(e.value)),
            ],
            onChanged: _select,
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Text(
                'No records for this action yet.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.inkMuted),
              ),
            )
          else ...[
            for (final record in _items)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _RecordCard(
                  record: record,
                  pupilNames: _pupilNames,
                  personNames: _personNames,
                ),
              ),
            if (_moreError != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _moreError!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.danger600),
                ),
              ),
            if (_hasMore)
              Center(
                child: OutlinedButton(
                  onPressed: _loadingMore ? null : _loadMore,
                  child: Text(_loadingMore ? 'Loading…' : 'Show older'),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _RecordCard extends StatelessWidget {
  const _RecordCard({
    required this.record,
    required this.pupilNames,
    required this.personNames,
  });

  final AuditRecord record;
  final Map<int, String> pupilNames;
  final Map<int, String> personNames;

  @override
  Widget build(BuildContext context) {
    final links = auditLinks(record);
    final notes = auditNotes(record.metadata);
    final theme = Theme.of(context).textTheme;

    final targets = <Widget>[];
    if (links.pupilId != null) {
      final id = links.pupilId!;
      targets.add(
        InkWell(
          onTap: () => context.go('/admin/more/pupils/$id'),
          child: Text(
            pupilNames[id] ?? 'Pupil #$id',
            style: const TextStyle(
              color: AppColors.brand600,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }
    if (links.authorisationId != null) {
      final id = links.authorisationId!;
      targets.add(
        Text(
          personNames[id] ?? 'Pickup person #$id',
          style: const TextStyle(color: AppColors.inkMuted),
        ),
      );
    }
    if (targets.isEmpty && record.entityId != null) {
      targets.add(
        Text(
          '${record.entityType.replaceAll('_', ' ')} #${record.entityId}',
          style: const TextStyle(color: AppColors.inkMuted),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(record.actionText, style: theme.titleSmall),
                ),
                Text(
                  formatDateTime(record.createdAt),
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              record.userName ?? 'System',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: record.userName == null ? AppColors.inkMuted : null,
              ),
            ),
            for (final t in targets) t,
            if (notes.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  notes.join(' · '),
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
