import 'package:flutter/foundation.dart';

import '../../../core/api/api_exception.dart';
import '../data/auth_repository.dart';
import '../domain/current_user.dart';

enum AuthStatus { unknown, signedOut, signedIn }

/// Holds who is signed in. The UI listens to it.
class AuthController extends ChangeNotifier {
  AuthController(this._repo);

  final AuthRepository _repo;

  AuthStatus _status = AuthStatus.unknown;
  CurrentUser? _user;
  bool _sessionExpired = false;

  AuthStatus get status => _status;
  CurrentUser? get user => _user;

  /// True when we were signed out because the session ended (not because the
  /// person tapped sign out). The router keeps their page and the login
  /// screen explains what happened.
  bool get sessionExpired => _sessionExpired;

  /// Called by the API client when a request with a token gets a 401.
  Future<void> expireSession() async {
    if (_status != AuthStatus.signedIn) return; // already out, or restoring
    await _repo.logout();
    _sessionExpired = true;
    _set(AuthStatus.signedOut, null);
  }

  /// When the app comes back to the foreground: a quick call that shows the
  /// login screen straight away if the session ended while we were away.
  Future<void> checkSession() async {
    if (_status != AuthStatus.signedIn) return;
    try {
      await _repo.fetchMe();
    } on ApiException {
      // 401 is handled through expireSession; other errors are ignored.
    }
  }

  /// App start: use a saved token if there is one and it still works.
  Future<void> restore() async {
    if (!await _repo.hasToken()) {
      _set(AuthStatus.signedOut, null);
      return;
    }
    try {
      _set(AuthStatus.signedIn, await _repo.fetchMe());
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        await _repo.logout();
        _sessionExpired = true;
      }
      // Offline at launch keeps the token for next time but shows login.
      _set(AuthStatus.signedOut, null);
    } on FormatException {
      await _repo.logout();
      _set(AuthStatus.signedOut, null);
    }
  }

  /// Throws [ApiException] (shown by the login screen) on failure.
  Future<void> signIn(String email, String password) async {
    try {
      final user = await _repo.login(email.trim(), password);
      _sessionExpired = false;
      _set(AuthStatus.signedIn, user);
    } on FormatException {
      throw const ApiException(
        kind: ApiErrorKind.unknown,
        message: 'This account type is not supported in the app.',
      );
    }
  }

  Future<void> signOut() async {
    await _repo.logout();
    _sessionExpired = false;
    _set(AuthStatus.signedOut, null);
  }

  void _set(AuthStatus status, CurrentUser? user) {
    _status = status;
    _user = user;
    notifyListeners();
  }
}
