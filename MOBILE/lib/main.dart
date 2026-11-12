import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'shared/widgets/pikva_logo.dart';

void main() {
  runApp(const PikvaApp());
}

class PikvaApp extends StatelessWidget {
  const PikvaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pikva',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const _ThemePreview(),
    );
  }
}

/// Temporary screen to eyeball the theme; replaced by login in M4.
class _ThemePreview extends StatelessWidget {
  const _ThemePreview();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pikva')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const PikvaLogo(height: 72),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Safe school pickups',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ),
            const SizedBox(height: 16),
            const TextField(decoration: InputDecoration(labelText: 'Email')),
            const SizedBox(height: 16),
            FilledButton(onPressed: () {}, child: const Text('Sign in')),
          ],
        ),
      ),
    );
  }
}
