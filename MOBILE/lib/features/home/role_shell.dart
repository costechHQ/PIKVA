import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// One tab in a role's bottom navigation.
class AppTab {
  const AppTab(this.path, this.icon, this.selectedIcon, this.label);

  final String path;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

const parentTabs = [
  AppTab('/parent', Icons.child_care_outlined, Icons.child_care, 'Children'),
  AppTab(
    '/parent/pickup-people',
    Icons.groups_outlined,
    Icons.groups,
    'Pickup people',
  ),
  AppTab('/parent/history', Icons.history_outlined, Icons.history, 'History'),
  AppTab('/parent/account', Icons.person_outline, Icons.person, 'Account'),
];

const gateTabs = [
  AppTab('/gate', Icons.qr_code_scanner, Icons.qr_code_scanner, 'Gate'),
  AppTab('/gate/account', Icons.person_outline, Icons.person, 'Account'),
];

/// A role's bottom navigation. Each tab is its own screen with its own app
/// bar. The first tab is the role's home and also the fallback.
class RoleShell extends StatelessWidget {
  const RoleShell({
    super.key,
    required this.tabs,
    required this.location,
    required this.child,
  });

  final List<AppTab> tabs;
  final String location;
  final Widget child;

  int get _index {
    final i = tabs.indexWhere(
      (t) => t.path != tabs.first.path && location.startsWith(t.path),
    );
    return i < 0 ? 0 : i;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => context.go(tabs[i].path),
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}
