import 'package:flutter/material.dart';

import '../auth/presentation/auth_controller.dart';

/// Placeholder home for a role; replaced by the real screens in Phases 2-4.
class RoleHomeScreen extends StatelessWidget {
  const RoleHomeScreen({super.key, required this.auth, required this.title});

  final AuthController auth;
  final String title;

  @override
  Widget build(BuildContext context) {
    final user = auth.user!;
    return Scaffold(
      appBar: AppBar(
        title: Text('$title home'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: auth.signOut,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Hello, ${user.name}',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(user.schoolName),
          ],
        ),
      ),
    );
  }
}
