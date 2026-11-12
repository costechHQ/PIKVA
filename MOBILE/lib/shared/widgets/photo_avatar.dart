import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// A round photo, or [initials] when there is no photo or it fails to load.
class PhotoAvatar extends StatelessWidget {
  const PhotoAvatar({
    super.key,
    required this.initials,
    this.photo,
    this.radius = 28,
  });

  final String initials;

  /// Null means no photo.
  final Future<Uint8List?>? photo;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final initialsText = Text(
      initials,
      style: TextStyle(
        color: AppColors.brand700,
        fontWeight: FontWeight.w600,
        fontSize: radius * 0.7,
      ),
    );
    final fallback = CircleAvatar(
      radius: radius,
      backgroundColor: AppColors.brand100,
      child: initialsText,
    );
    final pending = photo;
    if (pending == null) return fallback;

    return FutureBuilder<Uint8List?>(
      future: pending,
      builder: (context, snap) {
        final bytes = snap.data;
        if (bytes == null) return fallback;
        // The initials sit underneath, so an image that cannot be decoded
        // simply leaves them showing.
        return CircleAvatar(
          radius: radius,
          backgroundColor: AppColors.brand100,
          foregroundImage: MemoryImage(bytes),
          onForegroundImageError: (_, _) {},
          child: initialsText,
        );
      },
    );
  }
}
