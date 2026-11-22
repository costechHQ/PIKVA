import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/photo_loader.dart';
import '../../../core/photo_picker.dart';
import '../domain/pupil.dart';

class PupilRepository {
  PupilRepository(this._api) : _photos = PhotoLoader(_api);

  final ApiClient _api;
  final PhotoLoader _photos;

  Future<List<Pupil>> list() async {
    final json = await _api.get<List<dynamic>>('/pupils');
    return json.map((e) => Pupil.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Pupil> get(int id) async {
    final json = await _api.get<Map<String, dynamic>>('/pupils/$id');
    return Pupil.fromJson(json);
  }

  /// Adds a pupil (admins choose the parent; parents omit it).
  Future<Pupil> create(Map<String, Object?> body) async => Pupil.fromJson(
    await _api.post<Map<String, dynamic>>('/pupils', body: body),
  );

  /// Sends only the changed fields.
  Future<Pupil> update(int id, Map<String, Object?> changes) async =>
      Pupil.fromJson(
        await _api.patch<Map<String, dynamic>>('/pupils/$id', body: changes),
      );

  /// Uploads or replaces the photo (multipart field "photo"); the server
  /// cleans it into a JPEG.
  Future<Pupil> setPhoto(int id, PickedPhoto photo) async {
    final form = FormData.fromMap({
      'photo': MultipartFile.fromBytes(photo.bytes, filename: photo.name),
    });
    return Pupil.fromJson(
      await _api.upload<Map<String, dynamic>>(
        '/pupils/$id/photo',
        form,
        method: 'PUT',
      ),
    );
  }

  Future<Pupil> removePhoto(int id) async => Pupil.fromJson(
    await _api.delete<Map<String, dynamic>>('/pupils/$id/photo'),
  );

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
