import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';

/// The rest of the admin's tools, behind the "More" tab so the bottom bar
/// stays short.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          _Entry(
            icon: Icons.school_outlined,
            title: 'Pupils',
            subtitle: 'Pupils, their parents and who collects them',
            path: '/admin/more/pupils',
          ),
          _Entry(
            icon: Icons.groups_outlined,
            title: 'Pickup people',
            subtitle:
                'Everyone authorised to collect: filter, edit, deactivate',
            path: '/admin/more/pickup-people',
          ),
          _Entry(
            icon: Icons.history,
            title: 'Pickup history',
            subtitle: 'Every pupil released at the school, newest first',
            path: '/admin/more/history',
          ),
          _Entry(
            icon: Icons.people_outline,
            title: 'Users',
            subtitle: 'Parents and gate staff: add, edit, deactivate',
            path: '/admin/more/users',
          ),
          _Entry(
            icon: Icons.fact_check_outlined,
            title: 'Audit log',
            subtitle: 'Who did what, and when',
            path: '/admin/more/audit-log',
          ),
          _Entry(
            icon: Icons.person_outline,
            title: 'Account',
            subtitle: 'Your details, password and sign out',
            path: '/admin/more/account',
          ),
        ],
      ),
    );
  }
}

class _Entry extends StatelessWidget {
  const _Entry({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.path,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String path;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.all(12),
        leading: Icon(icon, color: AppColors.brand600),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.go(path),
      ),
    );
  }
}
