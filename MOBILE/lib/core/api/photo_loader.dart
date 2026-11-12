import 'dart:typed_data';

import 'api_client.dart';
import 'api_exception.dart';

/// Fetches photos that need the Bearer header and keeps them in memory.
///
/// The [key] must change when the photo changes (include the photo's
/// `photo_updated_at`), so a replaced photo is fetched again.
class PhotoLoader {
  PhotoLoader(this._api);

  final ApiClient _api;
  final Map<String, Uint8List> _cache = {};

  /// The bytes, or null when the server has no photo (404).
  Future<Uint8List?> load(String key, String path) async {
    final cached = _cache[key];
    if (cached != null) return cached;
    try {
      final bytes = Uint8List.fromList(await _api.getBytes(path));
      _cache[key] = bytes;
      return bytes;
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.notFound) return null;
      rethrow;
    }
  }

  /// Photos are private to the signed-in family: drop them on sign out.
  void clear() => _cache.clear();
}
