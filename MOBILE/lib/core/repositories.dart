import '../features/pickers/data/picker_repository.dart';
import '../features/pupils/data/pupil_repository.dart';
import 'api/api_client.dart';

/// Every data source the screens use, built once from one [ApiClient].
class Repositories {
  Repositories({required this.pupils, required this.pickers});

  factory Repositories.from(ApiClient api) => Repositories(
    pupils: PupilRepository(api),
    pickers: PickerRepository(api),
  );

  final PupilRepository pupils;
  final PickerRepository pickers;

  /// Photos are private to the signed-in family: call on sign out.
  void clearCaches() {
    pupils.clearCache();
    pickers.clearCache();
  }
}
