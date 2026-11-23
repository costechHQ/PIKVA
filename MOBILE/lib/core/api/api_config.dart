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

  /// Why [url] must not be used in a release build, or null if it is fine.
  /// Release builds on Android only allow https, and the emulator and
  /// localhost addresses mean nothing on a real phone.
  static String? releaseProblem(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasAuthority || uri.host.isEmpty) {
      return 'The server address (API_BASE_URL) is not a valid web address.';
    }
    if (uri.scheme != 'https') {
      return 'Release builds must use an https server address, '
          'but this build points at $url.';
    }
    const local = {'localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0'};
    if (local.contains(uri.host)) {
      return "This build points at ${uri.host}, which is only the developer's "
          'computer.';
    }
    return null;
  }

  static const connectTimeout = Duration(seconds: 10);
  static const receiveTimeout = Duration(seconds: 20);
}
