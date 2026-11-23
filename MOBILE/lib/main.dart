import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/data/session_renewer.dart';
import 'features/auth/data/token_store.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'core/repositories.dart';

void main() {
  // A release build pointed at a local or insecure server would install fine
  // and then fail on every request, so say so on screen instead.
  if (kReleaseMode) {
    final problem = ApiConfig.releaseProblem(ApiConfig.baseUrl);
    if (problem != null) {
      runApp(ConfigProblemApp(problem));
      return;
    }
  }

  final tokens = SecureTokenStore();

  // The client needs the renewer and the controller, and both need the
  // client, so these are filled in right after it is built.
  late final SessionRenewer renewer;
  late final AuthController auth;

  final api = ApiClient(
    tokenProvider: tokens.read,
    beforeRequest: () => renewer.ensureFresh(),
    onUnauthorized: () => auth.expireSession(),
  );

  renewer = SessionRenewer(
    tokens: tokens,
    requestNewToken: () async {
      final res = await api.post<Map<String, dynamic>>(
        '/auth/refresh',
        skipSession: true,
      );
      return res['access_token'] as String;
    },
  );
  auth = AuthController(AuthRepository(api: api, tokens: tokens));

  final repos = Repositories.from(api);

  // Photos belong to the signed-in family: forget them when anyone signs out.
  auth.addListener(() {
    if (auth.status == AuthStatus.signedOut) repos.clearCaches();
  });

  runApp(PikvaApp(auth: auth, repos: repos));
}

class PikvaApp extends StatefulWidget {
  const PikvaApp({super.key, required this.auth, required this.repos});

  final AuthController auth;
  final Repositories repos;

  @override
  State<PikvaApp> createState() => _PikvaAppState();
}

class _PikvaAppState extends State<PikvaApp> with WidgetsBindingObserver {
  late final GoRouter _router = buildRouter(widget.auth, widget.repos);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.auth.restore();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _router.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) widget.auth.checkSession();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Pikva',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerConfig: _router,
    );
  }
}

/// Shown instead of the app when a release build was made with a server
/// address it cannot use (see [ApiConfig.releaseProblem]).
class ConfigProblemApp extends StatelessWidget {
  const ConfigProblemApp(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'This app was built with the wrong server address.\n\n'
              '$message\n\n'
              'Rebuild with --dart-define=API_BASE_URL=https://your-server/api/v1',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
