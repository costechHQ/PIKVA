import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../data/pupil_repository.dart';
import '../domain/pupil.dart';

/// A pupil's photo, or their initials when there is none (or it fails to
/// load).
class PupilAvatar extends StatelessWidget {
  const PupilAvatar({
    super.key,
    required this.pupil,
    required this.repository,
    this.radius = 28,
  });

  final Pupil pupil;
  final PupilRepository repository;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final initials = CircleAvatar(
      radius: radius,
      backgroundColor: AppColors.brand100,
      child: Text(
        pupil.initials,
        style: TextStyle(
          color: AppColors.brand700,
          fontWeight: FontWeight.w600,
          fontSize: radius * 0.7,
        ),
      ),
    );
    if (!pupil.hasPhoto) return initials;

    return FutureBuilder<Uint8List?>(
      future: repository.photo(pupil),
      builder: (context, snap) {
        final bytes = snap.data;
        if (bytes == null) return initials;
        return CircleAvatar(
          radius: radius,
          backgroundColor: AppColors.brand100,
          backgroundImage: MemoryImage(bytes),
        );
      },
    );
  }
}
