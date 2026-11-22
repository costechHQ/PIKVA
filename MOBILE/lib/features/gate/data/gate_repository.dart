import 'dart:typed_data';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/api/photo_loader.dart';
import '../domain/gate.dart';

/// The gate checks (`/pickup/*`) and the photos gate staff compare against.
class GateRepository {
  GateRepository(this._api) : _pickerPhotos = PhotoLoader(_api);

  final ApiClient _api;
  final PhotoLoader _pickerPhotos;

  Future<VerifyOutcome> verify(GateRequest request) async =>
      VerifyOutcome.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/pickup/verify',
          body: request.toJson(),
        ),
      );

  Future<RefuseOutcome> refuse(GateRequest request) async =>
      RefuseOutcome.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/pickup/refuse',
          body: request.toJson(),
        ),
      );

  Future<ReleaseOutcome> release(GateRequest request) async =>
      ReleaseOutcome.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/pickup/release',
          body: request.toJson(),
        ),
      );

  /// The pickup person's photo, or null if they have none.
  Future<Uint8List?> pickerPhoto(GatePicker picker) {
    if (!picker.hasPhoto) return Future.value(null);
    return _pickerPhotos.load(
      'gate-picker-${picker.id}-${picker.photoUpdatedAt!.toIso8601String()}',
      '/pickers/${picker.id}/photo',
    );
  }

  /// The pupil's uploaded photo, or null if they have none. The gate response
  /// does not say whether one exists, so ask; a 404 just means no photo. Not
  /// cached, so a photo the parent just changed is never shown stale.
  Future<Uint8List?> pupilPhoto(GatePupil pupil) async {
    try {
      return Uint8List.fromList(
        await _api.getBytes('/pupils/${pupil.id}/photo'),
      );
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.notFound) return null;
      rethrow;
    }
  }

  void clearCache() => _pickerPhotos.clear();
}
