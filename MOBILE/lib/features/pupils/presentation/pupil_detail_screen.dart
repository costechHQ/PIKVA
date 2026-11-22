import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/error_view.dart';
import '../data/pupil_repository.dart';
import '../domain/pupil.dart';
import 'pupil_avatar.dart';

class PupilDetailScreen extends StatefulWidget {
  const PupilDetailScreen({
    super.key,
    required this.pupilId,
    required this.repository,
  });

  final int pupilId;
  final PupilRepository repository;

  @override
  State<PupilDetailScreen> createState() => _PupilDetailScreenState();
}

class _PupilDetailScreenState extends State<PupilDetailScreen> {
  late Future<Pupil> _pupil = widget.repository.get(widget.pupilId);

  void _reload() {
    setState(() {
      _pupil = widget.repository.get(widget.pupilId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Child'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/parent'),
        ),
      ),
      body: FutureBuilder<Pupil>(
        future: _pupil,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorView(error: snap.error!, onRetry: _reload);
          }
          final p = snap.data!;
          final age = p.ageOn(DateTime.now());
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Center(
                child: PupilAvatar(
                  pupil: p,
                  repository: widget.repository,
                  radius: 64,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                p.fullName,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 24),
              Card(
                child: ListTile(
                  leading: const Icon(
                    Icons.cake_outlined,
                    color: AppColors.brand600,
                  ),
                  title: const Text('Date of birth'),
                  subtitle: Text('${formatDate(p.dateOfBirth)} · $age years'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
