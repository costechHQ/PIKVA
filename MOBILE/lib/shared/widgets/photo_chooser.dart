import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/photo_picker.dart';
import '../../core/theme/app_colors.dart';
import 'photo_avatar.dart';

/// What to do with a photo when its form is saved.
sealed class PhotoChoice {
  const PhotoChoice();
}

/// Leave the photo as it is.
class KeepPhoto extends PhotoChoice {
  const KeepPhoto();
}

/// Upload this new photo.
class ReplacePhoto extends PhotoChoice {
  const ReplacePhoto(this.photo);
  final PickedPhoto photo;
}

/// Remove the current photo.
class RemovePhoto extends PhotoChoice {
  const RemovePhoto();
}

/// Preview and buttons for choosing, replacing or removing a photo, used by
/// the pickup person and pupil forms. The form decides when to upload.
class PhotoChooser extends StatelessWidget {
  const PhotoChooser({
    super.key,
    required this.name,
    required this.current,
    required this.choice,
    required this.busy,
    required this.onPick,
    required this.onChoice,
  });

  final String name;

  /// The photo they have now, or null if none.
  final Future<Uint8List?>? current;
  final PhotoChoice choice;
  final bool busy;
  final void Function(PhotoSource) onPick;
  final void Function(PhotoChoice) onChoice;

  @override
  Widget build(BuildContext context) {
    final c = choice;
    final Future<Uint8List?>? shown = switch (c) {
      ReplacePhoto() => Future.value(c.photo.bytes),
      RemovePhoto() => null,
      KeepPhoto() => current,
    };
    final initials = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    final hasCurrent = current != null;

    final String note = switch (c) {
      ReplacePhoto() => 'This photo will be saved with the other details.',
      RemovePhoto() => 'The photo will be removed when you save.',
      KeepPhoto() =>
        'Optional. JPEG, PNG or WebP, up to 5 MB. It helps gate staff '
            'recognise who is collecting.',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Photo (optional)', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PhotoAvatar(initials: initials, photo: shown, radius: 36),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: busy
                            ? null
                            : () => onPick(PhotoSource.camera),
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: const Text('Take photo'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 40),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: busy
                            ? null
                            : () => onPick(PhotoSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined),
                        label: const Text('Choose photo'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 40),
                        ),
                      ),
                      if (c is ReplacePhoto)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => onChoice(const KeepPhoto()),
                          child: Text(
                            hasCurrent
                                ? 'Keep current photo'
                                : "Don't use this photo",
                          ),
                        ),
                      if (c is KeepPhoto && hasCurrent)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => onChoice(const RemovePhoto()),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.danger600,
                          ),
                          child: const Text('Remove photo'),
                        ),
                      if (c is RemovePhoto)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => onChoice(const KeepPhoto()),
                          child: const Text('Keep photo'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    note,
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
