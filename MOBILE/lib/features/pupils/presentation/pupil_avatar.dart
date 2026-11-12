import 'package:flutter/material.dart';

import '../../../shared/widgets/photo_avatar.dart';
import '../data/pupil_repository.dart';
import '../domain/pupil.dart';

/// A pupil's photo, or their initials when there is none.
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
    return PhotoAvatar(
      initials: pupil.initials,
      photo: pupil.hasPhoto ? repository.photo(pupil) : null,
      radius: radius,
    );
  }
}
