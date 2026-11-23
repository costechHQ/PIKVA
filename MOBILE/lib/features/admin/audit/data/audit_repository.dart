import '../../../../core/api/api_client.dart';
import '../domain/audit_record.dart';

/// A page of records. The server sends no total, so we ask for one extra row
/// to know whether there is more.
class AuditPage {
  const AuditPage({required this.records, required this.hasMore});

  final List<AuditRecord> records;
  final bool hasMore;
}

class AuditRepository {
  AuditRepository(this._api);

  static const pageSize = 25;

  final ApiClient _api;

  /// Newest first. [action] limits to one kind of action; [offset] is how
  /// many are already loaded.
  Future<AuditPage> list({String? action, int offset = 0}) async {
    final json = await _api.get<List<dynamic>>(
      '/audit-logs',
      query: {'limit': pageSize + 1, 'offset': offset, 'action': ?action},
    );
    final all = json
        .map((e) => AuditRecord.fromJson(e as Map<String, dynamic>))
        .toList();
    return AuditPage(
      records: all.take(pageSize).toList(),
      hasMore: all.length > pageSize,
    );
  }
}
