import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/photo_loader.dart';
import '../../../core/photo_picker.dart';
import '../domain/pickup_code.dart';
import '../domain/pickup_person.dart';

class PickerRepository {
  PickerRepository(this._api) : _photos = PhotoLoader(_api);

  final ApiClient _api;
  final PhotoLoader _photos;

  /// Everyone the user may manage; [pupilId] limits to one pupil.
  Future<List<PickupPerson>> list({int? pupilId}) async {
    final json = await _api.get<List<dynamic>>(
      '/pickers',
      query: {'pupil_id': ?pupilId},
    );
    return json
        .map((e) => PickupPerson.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Adds a person (starts as awaiting school approval).
  Future<PickupPerson> create(Map<String, Object?> body) async {
    final json = await _api.post<Map<String, dynamic>>('/pickers', body: body);
    return PickupPerson.fromJson(json);
  }

  /// Sends only the changed fields. An edit can send the person back to
  /// school approval, which the server decides.
  Future<PickupPerson> update(int id, Map<String, Object?> changes) async {
    final json = await _api.patch<Map<String, dynamic>>(
      '/pickers/$id',
      body: changes,
    );
    return PickupPerson.fromJson(json);
  }

  /// Returns the updated person as the server now sees them.
  Future<PickupPerson> setActive(int id, {required bool active}) async {
    final action = active ? 'activate' : 'deactivate';
    final json = await _api.post<Map<String, dynamic>>('/pickers/$id/$action');
    return PickupPerson.fromJson(json);
  }

  /// School approval (admins only). Sends the `updated_at` the admin saw, so
  /// the server refuses (409) if the parent has changed the person since or
  /// someone already approved.
  Future<PickupPerson> approve(PickupPerson person) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/pickers/${person.id}/approve',
      body: {'updated_at': person.updatedAtRaw},
    );
    return PickupPerson.fromJson(json);
  }

  /// Issues today's code. The server shows it once, and a new code makes any
  /// earlier unused one stop working, so callers must confirm first.
  Future<PickupCode> issueCode(int authorisationId) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/pickup/codes',
      body: {'authorisation_id': authorisationId},
    );
    return PickupCode.fromJson(json);
  }

  /// Uploads or replaces the photo (multipart field "photo"). The server
  /// cleans it into a JPEG, and an approved person needs approval again.
  Future<PickupPerson> setPhoto(int id, PickedPhoto photo) async {
    final form = FormData.fromMap({
      'photo': MultipartFile.fromBytes(photo.bytes, filename: photo.name),
    });
    final json = await _api.upload<Map<String, dynamic>>(
      '/pickers/$id/photo',
      form,
      method: 'PUT',
    );
    return PickupPerson.fromJson(json);
  }

  Future<PickupPerson> removePhoto(int id) async {
    final json = await _api.delete<Map<String, dynamic>>('/pickers/$id/photo');
    return PickupPerson.fromJson(json);
  }

  Future<Uint8List?> photo(PickupPerson person) {
    if (!person.hasPhoto) return Future.value(null);
    return _photos.load(
      'picker-${person.id}-${person.photoUpdatedAt!.toIso8601String()}',
      '/pickers/${person.id}/photo',
    );
  }

  void clearCache() => _photos.clear();
}
