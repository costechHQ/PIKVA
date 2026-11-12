import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/error_view.dart';
import '../../../../shared/widgets/photo_avatar.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../alerts/domain/security_alert.dart';
import '../data/dashboard_repository.dart';
import '../domain/dashboard_data.dart';

/// The admin's overview (SRS 18.3): counts, approvals waiting, today's
/// pickups and open security alerts.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.auth,
    required this.repository,
    this.clock = DateTime.now,
  });

  final AuthController auth;
  final DashboardRepository repository;

  /// For tests.
  final DateTime Function() clock;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  Object? _error;
  DashboardData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.repository.load();
      if (!mounted) return;
      setState(() {
        _data = data;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: _body(),
    );
  }

  Widget _body() {
    final data = _data;
    if (_loading && data == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && data == null) {
      return ErrorView(error: _error!, onRetry: _retry);
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: _content(data!),
      ),
    );
  }

  List<Widget> _content(DashboardData data) {
    final user = widget.auth.user;
    final now = widget.clock();
    final today = data.todaysReleases(now);
    final waiting = data.waiting;
    final names = data.pupilNames;
    final tone = data.openAlerts.isEmpty
        ? null
        : data.hasUrgentAlert
        ? _Tone.danger
        : _Tone.warning;

    return [
      if (user != null) ...[
        Text(
          'Welcome back, ${user.name}. You are managing ${user.schoolName}.',
          style: const TextStyle(color: AppColors.inkMuted),
        ),
        const SizedBox(height: 16),
      ],
      Row(
        children: [
          Expanded(
            child: _Stat(
              label: 'Pupils',
              value: '${data.pupilCount}',
              icon: Icons.school_outlined,
              highlight: true,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _Stat(
              label: 'Active pickup people',
              value: '${data.activePeople}',
              icon: Icons.groups_outlined,
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _Stat(
              label: 'Pupils picked up today',
              value: data.pickedUpToday(now),
              icon: Icons.how_to_reg_outlined,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _Stat(
              label: 'Open security alerts',
              value: data.openAlertsText,
              icon: Icons.notifications_outlined,
              tone: tone,
              onTap: () => context.go('/admin/alerts'),
            ),
          ),
        ],
      ),
      if (waiting.isNotEmpty) ...[
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.warning50,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${waiting.length} pickup '
                '${waiting.length == 1 ? 'person is' : 'people are'} waiting '
                'for approval. They cannot collect until approved.',
              ),
              TextButton(
                onPressed: () => context.go('/admin/approvals'),
                child: const Text('Review approvals'),
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 24),
      _Panel(
        title: "Today's pickups",
        empty: 'No pupils picked up yet today.',
        children: [
          for (final r in today.take(panelSize))
            _Row(
              leading: PhotoAvatar(
                initials: _initials(r.pupilFirstName, r.pupilLastName),
                radius: 18,
              ),
              title: r.pupilName,
              subtitle:
                  'by ${r.pickerName}'
                  '${r.verifiedByName == null ? '' : ' · released by ${r.verifiedByName}'}',
              trailing: formatTime(r.releasedAt),
            ),
        ],
      ),
      const SizedBox(height: 16),
      _Panel(
        title: 'Open security alerts',
        empty: 'No open alerts. All clear.',
        action: data.openAlerts.isEmpty
            ? null
            : TextButton(
                onPressed: () => context.go('/admin/alerts'),
                child: const Text('All alerts'),
              ),
        children: [
          for (final a in data.openAlerts.take(panelSize))
            _Row(
              leading: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Icon(
                  Icons.circle,
                  size: 10,
                  color: a.isUrgent
                      ? AppColors.danger600
                      : AppColors.warning600,
                ),
              ),
              title: alertTitle(a.type),
              subtitle: a.pupilId != null
                  ? (names[a.pupilId] ?? 'Pupil #${a.pupilId}')
                  : a.message,
              trailing: formatDateTime(a.createdAt),
            ),
        ],
      ),
    ];
  }
}

String _initials(String a, String b) {
  final x = a.trim().isEmpty ? '' : a.trim()[0];
  final y = b.trim().isEmpty ? '' : b.trim()[0];
  return (x + y).toUpperCase();
}

enum _Tone { warning, danger }

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    required this.icon,
    this.highlight = false,
    this.tone,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool highlight;
  final _Tone? tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color border;
    final Color fg;
    final Color muted;
    if (highlight) {
      bg = AppColors.brand600;
      border = AppColors.brand600;
      fg = Colors.white;
      muted = Colors.white70;
    } else if (tone == _Tone.danger) {
      bg = AppColors.danger50;
      border = AppColors.danger600;
      fg = AppColors.ink;
      muted = AppColors.inkMuted;
    } else if (tone == _Tone.warning) {
      bg = AppColors.warning50;
      border = AppColors.warning600;
      fg = AppColors.ink;
      muted = AppColors.inkMuted;
    } else {
      bg = AppColors.card;
      border = AppColors.line;
      fg = AppColors.ink;
      muted = AppColors.inkMuted;
    }
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: border.withValues(alpha: 0.4)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: highlight ? Colors.white : AppColors.brand600),
              const SizedBox(height: 8),
              Text(
                value,
                style: Theme.of(context).textTheme.headlineMedium
                    ?.copyWith(color: fg, fontWeight: FontWeight.w800),
              ),
              Text(label, style: TextStyle(color: muted, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.title,
    required this.empty,
    required this.children,
    this.action,
  });

  final String title;
  final String empty;
  final List<Widget> children;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  ?action,
                ],
              ),
            ),
            if (children.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
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

class _Row extends StatelessWidget {
  const _Row({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  final Widget leading;
  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            trailing,
            style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
