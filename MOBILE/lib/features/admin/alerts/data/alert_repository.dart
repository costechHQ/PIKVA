import '../../../../core/api/api_client.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../domain/security_alert.dart';

/// A page of alerts. The server sends no total, so we ask for one extra row
/// to know whether there is more.
class AlertPage {
  const AlertPage({required this.alerts, required this.hasMore});

  final List<SecurityAlert> alerts;
  final bool hasMore;
}

class AlertRepository {
  AlertRepository(this._api);

  static const pageSize = 25;

  final ApiClient _api;

  /// Newest first. [offset] is how many are already loaded.
  Future<AlertPage> list(AlertFilter filter, {int offset = 0}) async {
    final json = await _api.get<List<dynamic>>(
      '/alerts',
      query: {'limit': pageSize + 1, 'offset': offset, 'status': ?filter.query},
    );
    final all = json
        .map((e) => SecurityAlert.fromJson(e as Map<String, dynamic>))
        .toList();
    return AlertPage(
      alerts: all.take(pageSize).toList(),
      hasMore: all.length > pageSize,
    );
  }

  /// Up to [limit] open alerts, newest first, with no paging (for summaries).
  Future<List<SecurityAlert>> open(int limit) async {
    final json = await _api.get<List<dynamic>>(
      '/alerts',
      query: {'limit': limit, 'status': 'open'},
    );
    return json
        .map((e) => SecurityAlert.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Marks an open alert resolved and returns it as the server now has it.
  Future<SecurityAlert> resolve(int id) async => SecurityAlert.fromJson(
    await _api.post<Map<String, dynamic>>('/alerts/$id/resolve'),
  );

  /// Names for pupils, pickup people and gate staff, so alerts read as
  /// people rather than numbers. Admins get their whole school from each.
  Future<AlertNames> names({
    required PupilRepository pupils,
    required PickerRepository pickers,
  }) async {
    // Three requests in parallel; a record's wait keeps each result typed.
    final (pupilList, pickerList, staffList) = await (
      pupils.list(),
      pickers.list(),
      _api.get<List<dynamic>>(
        '/schools/users',
        query: {'role': 'gate_staff', 'limit': 500},
      ),
    ).wait;
    return AlertNames(
      pupils: {for (final p in pupilList) p.id: p.fullName},
      people: {for (final p in pickerList) p.id: p.name},
      staff: {
        for (final s in staffList.cast<Map<String, dynamic>>())
          s['id'] as int: s['name'] as String,
      },
    );
  }
}
