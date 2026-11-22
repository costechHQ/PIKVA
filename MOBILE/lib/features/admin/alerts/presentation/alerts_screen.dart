import 'package:flutter/material.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../data/alert_repository.dart';
import '../domain/security_alert.dart';

/// Security alerts for admins (SRS 13, 18.7): failed gate checks to review
/// and resolve.
class AlertsScreen extends StatefulWidget {
  const AlertsScreen({
    super.key,
    required this.alerts,
    required this.pupils,
    required this.pickers,
  });

  final AlertRepository alerts;
  final PupilRepository pupils;
  final PickerRepository pickers;

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  String? _moreError;

  AlertFilter _filter = AlertFilter.open;
  List<SecurityAlert> _items = const [];
  bool _hasMore = false;
  AlertNames _names = const AlertNames();

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
      final (page, names) = await (
        widget.alerts.list(_filter),
        // Names are a nicety: if they cannot load, the alerts still show,
        // with numbers instead of names.
        widget.alerts
            .names(pupils: widget.pupils, pickers: widget.pickers)
            .catchError((_) => const AlertNames()),
      ).wait;
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = page.alerts;
        _hasMore = page.hasMore;
        _names = names;
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

  Future<void> _loadMore() async {
    final gen = _generation;
    setState(() {
      _loadingMore = true;
      _moreError = null;
    });
    try {
      final page = await widget.alerts.list(_filter, offset: _items.length);
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = [..._items, ...page.alerts];
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

  void _select(AlertFilter filter) {
    if (filter == _filter) return;
    _filter = filter;
    _start();
  }

  /// An alert changed: show its new state. In the Open list a resolved alert
  /// stays visible, as on the web, until the list is next loaded.
  void _replace(SecurityAlert alert) {
    setState(() {
      _items = [for (final a in _items) a.id == alert.id ? alert : a];
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Security alerts')),
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
          Wrap(
            spacing: 8,
            children: [
              for (final f in AlertFilter.values)
                ChoiceChip(
                  label: Text(f.label),
                  selected: f == _filter,
                  onSelected: (_) => _select(f),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Text(
                _filter == AlertFilter.open
                    ? 'No open alerts. All clear.'
                    : 'No alerts here yet.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            )
          else ...[
            for (final alert in _items)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _AlertCard(
                  key: ValueKey(alert.id),
                  alert: alert,
                  names: _names,
                  repository: widget.alerts,
                  onChanged: _replace,
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

class _AlertCard extends StatefulWidget {
  const _AlertCard({
    super.key,
    required this.alert,
    required this.names,
    required this.repository,
    required this.onChanged,
  });

  final SecurityAlert alert;
  final AlertNames names;
  final AlertRepository repository;
  final void Function(SecurityAlert) onChanged;

  @override
  State<_AlertCard> createState() => _AlertCardState();
}

class _AlertCardState extends State<_AlertCard> {
  bool _busy = false;
  String? _error;

  Future<void> _resolve() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await widget.repository.resolve(widget.alert.id);
      if (!mounted) return;
      widget.onChanged(updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final alert = widget.alert;
    final open = alert.isOpen;
    final urgent = alert.isUrgent;

    final accent = !open
        ? AppColors.line
        : urgent
        ? AppColors.danger600
        : AppColors.warning600;
    final (badgeBg, badgeFg, badgeText) = !open
        ? (AppColors.surface, AppColors.inkMuted, 'Resolved')
        : urgent
        ? (AppColors.danger50, AppColors.danger600, 'Open · urgent')
        : (AppColors.warning50, AppColors.warning600, 'Open');

    // The accent is its own bar inside a uniformly bordered, rounded card:
    // Flutter cannot paint rounded corners on a border with mixed colours.
    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: accent),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: _content(context, badgeBg, badgeFg, badgeText, open),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content(
    BuildContext context,
    Color badgeBg,
    Color badgeFg,
    String badgeText,
    bool open,
  ) {
    final alert = widget.alert;
    final names = widget.names;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                alert.title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: badgeBg,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                badgeText,
                style: TextStyle(
                  color: badgeFg,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(alert.message, style: const TextStyle(color: AppColors.inkMuted)),
        const SizedBox(height: 12),
        _Detail('When', formatDateTime(alert.createdAt)),
        if (alert.attemptedBy != null)
          _Detail(
            'Gate staff',
            names.staff[alert.attemptedBy] ?? 'Staff #${alert.attemptedBy}',
          ),
        if (alert.pupilId != null)
          _Detail(
            'Pupil',
            names.pupils[alert.pupilId] ?? 'Pupil #${alert.pupilId}',
          ),
        if (alert.authorisationId != null)
          _Detail(
            'Pickup person',
            names.people[alert.authorisationId] ??
                'Pickup person #${alert.authorisationId}',
          ),
        if (alert.resolvedAt != null)
          _Detail('Resolved', formatDateTime(alert.resolvedAt!)),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger600)),
        ],
        if (open) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton(
              onPressed: _busy ? null : _resolve,
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
              child: Text(_busy ? 'Resolving…' : 'Mark resolved'),
            ),
          ),
        ],
      ],
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
            width: 104,
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
