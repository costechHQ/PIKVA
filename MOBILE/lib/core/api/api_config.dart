/// Where the app finds the Pikva backend.
///
/// Override at build or run time:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:8000/api/v1
///
/// The default is the Android emulator's alias for the host machine
/// (10.0.2.2). The iOS simulator would use http://localhost:8000/api/v1.
abstract final class ApiConfig {
  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000/api/v1',
  );

  static const connectTimeout = Duration(seconds: 10);
  static const receiveTimeout = Duration(seconds: 20);
}
