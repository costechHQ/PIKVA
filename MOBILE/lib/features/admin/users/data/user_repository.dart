import '../../../../core/api/api_client.dart';
import '../domain/school_user.dart';

/// A page of users. The server sends no total, so we ask for one extra row
/// to know whether there is more.
class UserPage {
  const UserPage({required this.users, required this.hasMore});

  final List<SchoolUser> users;
  final bool hasMore;
}

/// A user just created, and whether their set-password email was accepted
/// by the email service.
class CreatedUser {
  const CreatedUser(this.user, {required this.setupEmailSent});

  final SchoolUser user;
  final bool setupEmailSent;
}

class UserRepository {
  UserRepository(this._api);

  static const pageSize = 50;

  final ApiClient _api;

  Future<UserPage> list({
    RoleFilter role = RoleFilter.all,
    String search = '',
    int offset = 0,
  }) async {
    final q = search.trim();
    final json = await _api.get<List<dynamic>>(
      '/schools/users',
      query: {
        'limit': pageSize + 1,
        'offset': offset,
        'role': ?role.query,
        if (q.isNotEmpty)
          'q': q.length > userSearchMax ? q.substring(0, userSearchMax) : q,
      },
    );
    final all = json
        .map((e) => SchoolUser.fromJson(e as Map<String, dynamic>))
        .toList();
    return UserPage(
      users: all.take(pageSize).toList(),
      hasMore: all.length > pageSize,
    );
  }

  /// Creates a parent or gate staff member. They get an emailed link to set
  /// their own password; the admin never sees or chooses it.
  Future<CreatedUser> create(Map<String, Object?> body) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/schools/users',
      body: body,
    );
    return CreatedUser(
      SchoolUser.fromJson(json),
      setupEmailSent: json['setup_email_sent'] as bool,
    );
  }

  /// Sends only the changed fields.
  Future<SchoolUser> update(int id, Map<String, Object?> changes) async =>
      SchoolUser.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/schools/users/$id',
          body: changes,
        ),
      );

  /// Deactivating signs the user out now and blocks sign-in.
  Future<SchoolUser> setActive(int id, {required bool active}) async =>
      SchoolUser.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/schools/users/$id/${active ? 'activate' : 'deactivate'}',
        ),
      );

  /// Emails a new set-password link (cancelling earlier unused ones). True if
  /// the email service accepted it.
  Future<bool> sendSetupLink(int id) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/schools/users/$id/setup-email',
    );
    return json['email_sent'] as bool;
  }
}
