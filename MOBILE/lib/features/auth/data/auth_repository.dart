import '../../../core/api/api_client.dart';
import '../domain/current_user.dart';
import 'token_store.dart';

/// Talks to /auth/* and keeps the token store in step.
class AuthRepository {
  AuthRepository({required this._api, required this._tokens});

  final ApiClient _api;
  final TokenStore _tokens;

  /// Signs in, saves the token, and returns the user. If `/auth/me` fails
  /// the token is removed again so we never hold a half-signed-in state.
  Future<CurrentUser> login(String email, String password) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'email': email, 'password': password},
    );
    await _tokens.write(res['access_token'] as String);
    try {
      return await fetchMe();
    } catch (_) {
      await _tokens.clear();
      rethrow;
    }
  }

  Future<CurrentUser> fetchMe() async {
    final json = await _api.get<Map<String, dynamic>>('/auth/me');
    return CurrentUser.fromJson(json);
  }

  Future<bool> hasToken() async => (await _tokens.read()) != null;

  Future<void> logout() => _tokens.clear();
}
