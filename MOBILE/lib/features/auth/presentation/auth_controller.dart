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

  AuthStatus get status => _status;
  CurrentUser? get user => _user;

  /// App start: use a saved token if there is one and it still works.
  Future<void> restore() async {
    if (!await _repo.hasToken()) {
      _set(AuthStatus.signedOut, null);
      return;
    }
    try {
      _set(AuthStatus.signedIn, await _repo.fetchMe());
    } on ApiException catch (e) {
      if (e.isUnauthorized) await _repo.logout();
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
      _set(AuthStatus.signedIn, await _repo.login(email.trim(), password));
    } on FormatException {
      throw const ApiException(
        kind: ApiErrorKind.unknown,
        message: 'This account type is not supported in the app.',
      );
    }
  }

  Future<void> signOut() async {
    await _repo.logout();
    _set(AuthStatus.signedOut, null);
  }

  void _set(AuthStatus status, CurrentUser? user) {
    _status = status;
    _user = user;
    notifyListeners();
  }
}
