import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/api/api_client.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/data/session_renewer.dart';
import 'features/auth/data/token_store.dart';
import 'features/auth/presentation/auth_controller.dart';

void main() {
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

  runApp(PikvaApp(auth: auth));
}

class PikvaApp extends StatefulWidget {
  const PikvaApp({super.key, required this.auth});

  final AuthController auth;

  @override
  State<PikvaApp> createState() => _PikvaAppState();
}

class _PikvaAppState extends State<PikvaApp> with WidgetsBindingObserver {
  late final GoRouter _router = buildRouter(widget.auth);

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
