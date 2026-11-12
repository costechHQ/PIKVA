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
