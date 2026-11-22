import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../domain/pickup_person.dart';

/// A pickup person's status as a small coloured pill.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});

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
