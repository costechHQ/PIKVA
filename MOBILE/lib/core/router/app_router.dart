import 'package:go_router/go_router.dart';

import '../../features/auth/domain/current_user.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/home/role_home_screen.dart';
import '../../features/home/splash_screen.dart';

abstract final class Routes {
  static const splash = '/splash';
  static const login = '/login';
  static const parent = '/parent';
  static const gate = '/gate';
  static const admin = '/admin';

  static String homeFor(UserRole role) => switch (role) {
        UserRole.parent => parent,
        UserRole.gateStaff => gate,
        UserRole.schoolAdmin => admin,
      };
}

bool _inArea(String path, String home) =>
    path == home || path.startsWith('$home/');

/// The return-to-page rule (SRS 6.10): a relative path on this app (one
/// leading slash, no scheme or host), inside the signed-in role's own area,
/// and never an /api/ path.
bool isSafeNext(String? next, String home) {
  if (next == null || !next.startsWith('/') || next.startsWith('//')) {
    return false;
  }
  if (next.contains('\\')) return false;
  final uri = Uri.tryParse(next);
  if (uri == null || uri.hasScheme || uri.hasAuthority) return false;
  if (uri.path.startsWith('/api/') || uri.path == '/api') return false;
  return _inArea(uri.path, home);
}

/// One router for the whole app. The redirect keeps each role inside its own
/// area; the backend still decides what each role may actually do.
GoRouter buildRouter(AuthController auth) {
  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: auth,
    redirect: (context, state) {
      final path = state.uri.path;

      switch (auth.status) {
        case AuthStatus.unknown:
          return path == Routes.splash ? null : Routes.splash;
        case AuthStatus.signedOut:
          if (path == Routes.login) return null;
          // Only a session that ended keeps the page; a tap on sign out
          // does not. Splash is never worth returning to.
          if (auth.sessionExpired && path != Routes.splash) {
            return Uri(
              path: Routes.login,
              queryParameters: {'next': state.uri.toString()},
            ).toString();
          }
          return Routes.login;
        case AuthStatus.signedIn:
          final home = Routes.homeFor(auth.user!.role);
          if (path == Routes.login) {
            final next = state.uri.queryParameters['next'];
            return isSafeNext(next, home) ? next : home;
          }
          // Anywhere outside the user's own area goes to their home.
          return _inArea(path, home) ? null : home;
      }
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(
        path: Routes.login,
        builder: (_, _) => LoginScreen(auth: auth),
      ),
      GoRoute(
        path: Routes.parent,
        builder: (_, _) => RoleHomeScreen(auth: auth, title: 'Parent'),
      ),
      GoRoute(
        path: Routes.gate,
        builder: (_, _) => RoleHomeScreen(auth: auth, title: 'Gate'),
      ),
      GoRoute(
        path: Routes.admin,
        builder: (_, _) => RoleHomeScreen(auth: auth, title: 'Admin'),
      ),
    ],
  );
}
