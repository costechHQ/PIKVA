import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/error_view.dart';
import '../data/pupil_repository.dart';
import '../domain/pupil.dart';
import 'pupil_avatar.dart';

class PupilsScreen extends StatefulWidget {
  const PupilsScreen({super.key, required this.repository});

  final PupilRepository repository;

  @override
  State<PupilsScreen> createState() => _PupilsScreenState();
}

class _PupilsScreenState extends State<PupilsScreen> {
  late Future<List<Pupil>> _pupils = widget.repository.list();

  Future<void> _reload() async {
    final next = widget.repository.list();
    setState(() {
      _pupils = next;
    });
    try {
      await next;
    } catch (_) {
      // The error is shown by the FutureBuilder.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My children')),
      body: FutureBuilder<List<Pupil>>(
        future: _pupils,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorView(error: snap.error!, onRetry: _reload);
          }
          final pupils = snap.data!;
          if (pupils.isEmpty) {
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
            onRefresh: _reload,
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: pupils.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final p = pupils[i];
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(12),
                    leading: PupilAvatar(
                      pupil: p,
                      repository: widget.repository,
                    ),
                    title: Text(p.fullName),
                    subtitle: Text(
                      'Born ${formatDate(p.dateOfBirth)}',
                      style: const TextStyle(color: AppColors.inkMuted),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.go('/parent/pupils/${p.id}'),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
