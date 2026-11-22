import 'dart:typed_data';

import '../../../core/api/api_client.dart';
import '../../../core/api/photo_loader.dart';
import '../domain/pickup_code.dart';
import '../domain/pickup_person.dart';

class PickerRepository {
  PickerRepository(this._api) : _photos = PhotoLoader(_api);

  final ApiClient _api;
  final PhotoLoader _photos;

  Future<List<PickupPerson>> list() async {
    final json = await _api.get<List<dynamic>>('/pickers');
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

  /// Issues today's code. The server shows it once, and a new code makes any
  /// earlier unused one stop working, so callers must confirm first.
  Future<PickupCode> issueCode(int authorisationId) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/pickup/codes',
      body: {'authorisation_id': authorisationId},
    );
    return PickupCode.fromJson(json);
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
