import '../features/admin/alerts/data/alert_repository.dart';
import '../features/admin/dashboard/data/dashboard_repository.dart';
import '../features/admin/users/data/user_repository.dart';
import '../features/gate/data/gate_repository.dart';
import '../features/history/data/release_repository.dart';
import '../features/pickers/data/picker_repository.dart';
import '../features/pupils/data/pupil_repository.dart';
import 'api/api_client.dart';
import 'photo_picker.dart';
import 'qr_scanner.dart';

/// Every data source the screens use, built once from one [ApiClient].
class Repositories {
  Repositories({
    required this.pupils,
    required this.pickers,
    required this.releases,
    required this.gate,
    required this.alerts,
    required this.users,
    PhotoPicker? photoPicker,
    QrScanner? scanner,
  }) : photoPicker = photoPicker ?? ImagePickerPhotoPicker(),
       scanner = scanner ?? const MobileQrScanner();

  factory Repositories.from(
    ApiClient api, {
    PhotoPicker? photoPicker,
    QrScanner? scanner,
  }) => Repositories(
    pupils: PupilRepository(api),
    pickers: PickerRepository(api),
    releases: ReleaseRepository(api),
    gate: GateRepository(api),
    alerts: AlertRepository(api),
    users: UserRepository(api),
    photoPicker: photoPicker,
    scanner: scanner,
  );

  final PupilRepository pupils;
  final PickerRepository pickers;
  final ReleaseRepository releases;
  final GateRepository gate;
  final AlertRepository alerts;
  final UserRepository users;

  /// Camera and gallery access for photo uploads.
  final PhotoPicker photoPicker;

  /// Camera QR reading for the gate.
  final QrScanner scanner;

  /// The admin dashboard's summary of the other lists.
  DashboardRepository get dashboard => DashboardRepository(
    pupils: pupils,
    pickers: pickers,
    releases: releases,
    alerts: alerts,
  );

  /// Photos are private to the signed-in family: call on sign out.
  void clearCaches() {
    pupils.clearCache();
    pickers.clearCache();
    gate.clearCache();
  }
}
