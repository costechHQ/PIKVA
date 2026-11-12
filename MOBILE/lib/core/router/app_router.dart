import 'package:go_router/go_router.dart';

import '../../features/auth/domain/current_user.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/home/splash_screen.dart';
import '../../features/account/presentation/account_screen.dart';
import '../../features/admin/alerts/presentation/alerts_screen.dart';
import '../../features/history/presentation/history_screen.dart';
import '../../features/gate/presentation/gate_screen.dart';
import '../../features/home/role_shell.dart';
import '../../features/pickers/presentation/pickup_people_screen.dart';
import '../../features/pupils/presentation/pupil_detail_screen.dart';
import '../../features/pupils/presentation/pupils_screen.dart';
import '../repositories.dart';

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
GoRouter buildRouter(AuthController auth, Repositories repos) {
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
      ShellRoute(
        builder: (_, state, child) =>
            RoleShell(tabs: parentTabs, location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: Routes.parent,
            builder: (_, _) => PupilsScreen(repository: repos.pupils),
            routes: [
              GoRoute(
                path: 'pupils/:id',
                builder: (_, state) => PupilDetailScreen(
                  pupilId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
                  repository: repos.pupils,
                ),
              ),
              GoRoute(
                path: 'account',
                builder: (_, _) => AccountScreen(auth: auth),
              ),
              GoRoute(
                path: 'history',
                builder: (_, _) => HistoryScreen(
                  pupils: repos.pupils,
                  releases: repos.releases,
                ),
              ),
              GoRoute(
                path: 'pickup-people',
                builder: (_, _) => PickupPeopleScreen(
                  pupils: repos.pupils,
                  pickers: repos.pickers,
                  photoPicker: repos.photoPicker,
                ),
              ),
            ],
          ),
        ],
      ),
      ShellRoute(
        builder: (_, state, child) =>
            RoleShell(tabs: gateTabs, location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: Routes.gate,
            builder: (_, _) =>
                GateScreen(gate: repos.gate, scanner: repos.scanner),
            routes: [
              GoRoute(
                path: 'account',
                builder: (_, _) => AccountScreen(auth: auth),
              ),
            ],
          ),
        ],
      ),
      ShellRoute(
        builder: (_, state, child) =>
            RoleShell(tabs: adminTabs, location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: Routes.admin,
            builder: (_, _) => AlertsScreen(
              alerts: repos.alerts,
              pupils: repos.pupils,
              pickers: repos.pickers,
            ),
            routes: [
              GoRoute(
                path: 'account',
                builder: (_, _) => AccountScreen(auth: auth),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
