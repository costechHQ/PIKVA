import 'package:flutter/material.dart';

import 'core/api/api_client.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/data/token_store.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/auth/presentation/login_screen.dart';

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
  @override
  void initState() {
    super.initState();
    widget.auth.restore();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pikva',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      // Temporary switch; replaced by go_router role routing in M4c.
      home: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) {
          switch (widget.auth.status) {
            case AuthStatus.unknown:
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            case AuthStatus.signedOut:
              return LoginScreen(auth: widget.auth);
            case AuthStatus.signedIn:
              return _SignedInPlaceholder(auth: widget.auth);
          }
        },
      ),
    );
  }
}

class _SignedInPlaceholder extends StatelessWidget {
  const _SignedInPlaceholder({required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final user = auth.user!;
    return Scaffold(
      appBar: AppBar(title: const Text('Pikva')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Hello, ${user.name}',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text('${user.role.value} at ${user.schoolName}'),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: auth.signOut,
              child: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}
