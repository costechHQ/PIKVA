import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// The parent's bottom navigation. Each tab is its own screen with its own
/// app bar.
class ParentShell extends StatelessWidget {
  const ParentShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  static const _tabs = [
    ('/parent', Icons.child_care_outlined, Icons.child_care, 'Children'),
    (
      '/parent/pickup-people',
      Icons.groups_outlined,
      Icons.groups,
      'Pickup people',
    ),
    ('/parent/history', Icons.history_outlined, Icons.history, 'History'),
  ];

  int get _index {
    final i = _tabs.indexWhere(
      (t) => t.$1 != '/parent' && location.startsWith(t.$1),
    );
    return i < 0 ? 0 : i;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => context.go(_tabs[i].$1),
        destinations: [
          for (final t in _tabs)
            NavigationDestination(
              icon: Icon(t.$2),
              selectedIcon: Icon(t.$3),
              label: t.$4,
            ),
        ],
      ),
    );
  }
}
