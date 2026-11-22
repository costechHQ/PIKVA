import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

enum PhotoSource { camera, gallery }

/// A photo chosen on the phone, held in memory until it is uploaded.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.name});

  final Uint8List bytes;
  final String name;
}

/// Why a chosen photo cannot be used, or null when it is fine. Mirrors the
/// backend (JPEG, PNG or WebP, at most 5 MB) so a bad file is caught before
/// the upload.
String? photoProblem(PickedPhoto photo) {
  const maxBytes = 5 * 1024 * 1024;
  final name = photo.name.toLowerCase();
  const types = ['.jpg', '.jpeg', '.png', '.webp'];
  if (!types.any(name.endsWith)) return 'Choose a JPEG, PNG or WebP photo.';
  if (photo.bytes.length > maxBytes) {
    return 'The photo must be 5 MB or smaller.';
  }
  return null;
}

/// Takes or chooses a photo. An interface so tests need no camera.
abstract interface class PhotoPicker {
  /// Null when the person cancels.
  Future<PickedPhoto?> pick(PhotoSource source);
}

class ImagePickerPhotoPicker implements PhotoPicker {
  ImagePickerPhotoPicker([ImagePicker? picker])
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<PickedPhoto?> pick(PhotoSource source) async {
    final file = await _picker.pickImage(
      source: source == PhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      // The backend shrinks to 800 px anyway; this keeps the upload small.
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (file == null) return null;
    return PickedPhoto(bytes: await file.readAsBytes(), name: file.name);
  }
}
