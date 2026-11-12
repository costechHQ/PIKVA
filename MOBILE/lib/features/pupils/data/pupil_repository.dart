import 'dart:typed_data';

import '../../../core/api/api_client.dart';
import '../../../core/api/photo_loader.dart';
import '../domain/pupil.dart';

class PupilRepository {
  PupilRepository(this._api) : _photos = PhotoLoader(_api);

  final ApiClient _api;
  final PhotoLoader _photos;

  Future<List<Pupil>> list() async {
    final json = await _api.get<List<dynamic>>('/pupils');
    return json
        .map((e) => Pupil.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Pupil> get(int id) async {
    final json = await _api.get<Map<String, dynamic>>('/pupils/$id');
    return Pupil.fromJson(json);
  }

  /// The photo bytes, or null when the pupil has none.
  Future<Uint8List?> photo(Pupil pupil) {
    if (!pupil.hasPhoto) return Future.value(null);
    return _photos.load(
      'pupil-${pupil.id}-${pupil.photoUpdatedAt!.toIso8601String()}',
      '/pupils/${pupil.id}/photo',
    );
  }

  void clearCache() => _photos.clear();
}
