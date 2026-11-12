import 'dart:typed_data';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/pupil.dart';

class PupilRepository {
  PupilRepository(this._api);

  final ApiClient _api;
  final Map<String, Uint8List> _photos = {};

  Future<List<Pupil>> list() async {
    final json = await _api.get<List<dynamic>>('/pupils');
    return json.map((e) => Pupil.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Pupil> get(int id) async {
    final json = await _api.get<Map<String, dynamic>>('/pupils/$id');
    return Pupil.fromJson(json);
  }

  /// The photo bytes, or null when the pupil has none. Photos need the Bearer
  /// header, so they are fetched through the API client and cached in memory
  /// by pupil and photo version.
  Future<Uint8List?> photo(Pupil pupil) async {
    if (!pupil.hasPhoto) return null;
    final key = '${pupil.id}-${pupil.photoUpdatedAt!.toIso8601String()}';
    final cached = _photos[key];
    if (cached != null) return cached;
    try {
      final bytes = Uint8List.fromList(
        await _api.getBytes('/pupils/${pupil.id}/photo'),
      );
      _photos[key] = bytes;
      return bytes;
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.notFound) return null;
      rethrow;
    }
  }

  /// Photos are private to the signed-in family: drop them on sign out.
  void clearCache() => _photos.clear();
}
