import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/api/api_client.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/data/token_store.dart';
import 'features/auth/presentation/auth_controller.dart';

void main() {
  final tokens = SecureTokenStore();
  final api = ApiClient(tokenProvider: tokens.read);
  final auth = AuthController(AuthRepository(api: api, tokens: tokens));
  runApp(PikvaApp(auth: auth));
}

class PikvaApp extends StatefulWidget {
  const PikvaApp({super.key, required this.auth});

  final AuthController auth;

  @override
  State<PikvaApp> createState() => _PikvaAppState();
}

class _PikvaAppState extends State<PikvaApp> {
  late final GoRouter _router = buildRouter(widget.auth);

  @override
  void initState() {
    super.initState();
    widget.auth.restore();
  }

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
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
