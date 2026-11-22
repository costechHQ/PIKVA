import '../../../core/api/api_client.dart';
import '../domain/release.dart';

/// A page of history. There is no total count from the server, so we ask for
/// one row more than the page size: if it comes back there is more.
class ReleasePage {
  const ReleasePage({required this.releases, required this.hasMore});

  final List<Release> releases;
  final bool hasMore;
}

class ReleaseRepository {
  ReleaseRepository(this._api);

  static const pageSize = 25;

  final ApiClient _api;

  /// The latest [limit] releases, newest first, with no paging (for summaries).
  Future<List<Release>> latest(int limit, {int? pupilId}) async {
    final json = await _api.get<List<dynamic>>(
      '/releases',
      query: {'limit': limit, 'pupil_id': ?pupilId},
    );
    return json
        .map((e) => Release.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Newest first. [offset] is how many are already loaded. [day] limits to
  /// that local calendar day (midnight to midnight on the phone).
  Future<ReleasePage> list({
    int? pupilId,
    DateTime? day,
    int offset = 0,
  }) async {
    final query = <String, dynamic>{
      'limit': pageSize + 1,
      'offset': offset,
      'pupil_id': ?pupilId,
    };
    if (day != null) {
      final start = DateTime(day.year, day.month, day.day);
      final end = DateTime(day.year, day.month, day.day + 1);
      query['since'] = start.toUtc().toIso8601String();
      query['until'] = end.toUtc().toIso8601String();
    }
    final json = await _api.get<List<dynamic>>('/releases', query: query);
    final all = json
        .map((e) => Release.fromJson(e as Map<String, dynamic>))
        .toList();
    return ReleasePage(
      releases: all.take(pageSize).toList(),
      hasMore: all.length > pageSize,
    );
  }
}
