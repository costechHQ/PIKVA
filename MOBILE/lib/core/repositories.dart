import '../features/pickers/data/picker_repository.dart';
import '../features/pupils/data/pupil_repository.dart';
import 'api/api_client.dart';
import 'photo_picker.dart';

/// Every data source the screens use, built once from one [ApiClient].
class Repositories {
  Repositories({
    required this.pupils,
    required this.pickers,
    PhotoPicker? photoPicker,
  }) : photoPicker = photoPicker ?? ImagePickerPhotoPicker();

  factory Repositories.from(ApiClient api, {PhotoPicker? photoPicker}) =>
      Repositories(
        pupils: PupilRepository(api),
        pickers: PickerRepository(api),
        photoPicker: photoPicker,
      );

  final PupilRepository pupils;
  final PickerRepository pickers;

  /// Camera and gallery access for photo uploads.
  final PhotoPicker photoPicker;

  /// Photos are private to the signed-in family: call on sign out.
  void clearCaches() {
    pupils.clearCache();
    pickers.clearCache();
  }
}
