import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../../shared/widgets/error_view.dart';
import '../data/user_repository.dart';
import '../domain/school_user.dart';
import 'user_form_screen.dart';

/// School users for admins (SRS 6.7): search by name or email, filter by
/// role, edit, send a set-password link, deactivate and activate.
class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key, required this.users});

  final UserRepository users;

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final _search = TextEditingController();
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  String? _moreError;

  RoleFilter _role = RoleFilter.all;
  String _query = '';
  List<SchoolUser> _items = const [];
  bool _hasMore = false;

  // Bumped on every fresh load so a slow, older answer cannot overwrite the
  // results of a newer search or filter.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final gen = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _moreError = null;
    });
    try {
      final page = await widget.users.list(role: _role, search: _query);
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = page.users;
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || gen != _generation) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final gen = _generation;
    setState(() {
      _loadingMore = true;
      _moreError = null;
    });
    try {
      final page = await widget.users.list(
        role: _role,
        search: _query,
        offset: _items.length,
      );
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = [..._items, ...page.users];
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } on ApiException catch (e) {
      if (!mounted || gen != _generation) return;
      setState(() {
        _moreError = errorText(e);
        _loadingMore = false;
      });
    }
  }

  void _selectRole(RoleFilter role) {
    if (role == _role) return;
    _role = role;
    _start();
  }

  void _submitSearch(String text) {
    final q = text.trim();
    if (q == _query) return;
    _query = q;
    _start();
  }

  void _clearSearch() {
    _search.clear();
    _submitSearch('');
  }

  void _upsert(SchoolUser user) {
    setState(() {
      final known = _items.any((u) => u.id == user.id);
      _items = known
          ? [for (final u in _items) u.id == user.id ? user : u]
          : [user, ..._items];
    });
  }

  void _tell(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _add() async {
    final added = await Navigator.of(context).push<SchoolUser>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => UserFormScreen(users: widget.users),
      ),
    );
    if (added != null && mounted) _upsert(added);
  }

  Future<void> _edit(SchoolUser user) async {
    final saved = await Navigator.of(context).push<SchoolUser>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => UserFormScreen(users: widget.users, original: user),
      ),
    );
    if (saved != null && mounted) {
      _upsert(saved);
      _tell('Saved changes to ${saved.name}.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Users'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/admin/more'),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Add user'),
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_error != null && _items.isEmpty) {
      return ErrorView(error: _error!, onRetry: _start);
    }
    return RefreshIndicator(
      onRefresh: _start,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          TextField(
            controller: _search,
            textInputAction: TextInputAction.search,
            maxLength: userSearchMax,
            onSubmitted: _submitSearch,
            decoration: InputDecoration(
              labelText: 'Search by name or email',
              counterText: '',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _query.isEmpty && _search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(Icons.close),
                      onPressed: _clearSearch,
                    ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final r in RoleFilter.values)
                ChoiceChip(
                  label: Text(r.label),
                  selected: r == _role,
                  onSelected: (_) => _selectRole(r),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Text(
                _query.isNotEmpty
                    ? 'No users match "$_query".'
                    : 'No users here yet.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            )
          else ...[
            for (final user in _items)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _UserCard(
                  key: ValueKey(user.id),
                  user: user,
                  users: widget.users,
                  onEdit: () => _edit(user),
                  onChanged: _upsert,
                  onNotice: _tell,
                ),
              ),
            if (_moreError != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _moreError!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.danger600),
                ),
              ),
            if (_hasMore)
              Center(
                child: OutlinedButton(
                  onPressed: _loadingMore ? null : _loadMore,
                  child: Text(_loadingMore ? 'Loading…' : 'Show more'),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _UserCard extends StatefulWidget {
  const _UserCard({
    super.key,
    required this.user,
    required this.users,
    required this.onEdit,
    required this.onChanged,
    required this.onNotice,
  });

  final SchoolUser user;
  final UserRepository users;
  final VoidCallback onEdit;
  final void Function(SchoolUser) onChanged;
  final void Function(String) onNotice;

  @override
  State<_UserCard> createState() => _UserCardState();
}

class _UserCardState extends State<_UserCard> {
  bool _busy = false;
  bool _confirming = false;
  String? _error;

  SchoolUser get _user => widget.user;

  Future<void> _sendLink() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await widget.users.sendSetupLink(_user.id);
      if (!mounted) return;
      final message = setupLinkMessage(
        name: _user.name,
        email: _user.email,
        sent: sent,
      );
      if (sent) {
        widget.onNotice(message);
      } else {
        setState(() => _error = message);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setActive(bool active) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await widget.users.setActive(_user.id, active: active);
      if (!mounted) return;
      setState(() => _confirming = false);
      widget.onChanged(updated);
      widget.onNotice(
        '${_user.name} ${active ? 'activated. They can sign in again.' : 'deactivated.'}',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = _user;
    final theme = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(user.name, style: theme.titleMedium)),
                const SizedBox(width: 8),
                _Badge(user.roleLabel, AppColors.brand50, AppColors.brand700),
                if (!user.isActive) ...[
                  const SizedBox(width: 6),
                  const _Badge(
                    'Deactivated',
                    AppColors.danger50,
                    AppColors.danger600,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 4),
            SelectableText(user.email),
            SelectableText(
              user.phone,
              style: const TextStyle(color: AppColors.inkMuted),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger600)),
            ],
            if (user.isManageable) ...[
              const SizedBox(height: 12),
              if (_confirming) ..._confirmDeactivate(user) else _actions(user),
            ],
          ],
        ),
      ),
    );
  }

  Widget _actions(SchoolUser user) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        OutlinedButton(
          onPressed: _busy ? null : widget.onEdit,
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
          child: const Text('Edit'),
        ),
        if (user.isActive)
          OutlinedButton(
            onPressed: _busy ? null : _sendLink,
            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
            child: Text(_busy ? 'Working…' : 'Send link'),
          ),
        if (user.isActive)
          OutlinedButton(
            onPressed: _busy ? null : () => setState(() => _confirming = true),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.danger600,
              minimumSize: const Size(0, 40),
            ),
            child: const Text('Deactivate'),
          )
        else
          FilledButton(
            onPressed: _busy ? null : () => _setActive(true),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
            child: Text(_busy ? 'Activating…' : 'Activate'),
          ),
      ],
    );
  }

  List<Widget> _confirmDeactivate(SchoolUser user) => [
    Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.danger50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        'Deactivate ${user.name}? They are signed out now and cannot sign in '
        'until you activate them again.'
        '${user.role?.value == 'parent' ? ' Their pickup people and any code already issued keep working: deactivate those on Pickup people if they should not collect.' : ''}',
      ),
    ),
    const SizedBox(height: 8),
    Row(
      children: [
        Expanded(
          child: FilledButton(
            onPressed: _busy ? null : () => _setActive(false),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.danger600,
              minimumSize: const Size(0, 44),
            ),
            child: Text(_busy ? 'Deactivating…' : 'Deactivate'),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton(
            onPressed: _busy ? null : () => setState(() => _confirming = false),
            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
            child: const Text('Cancel'),
          ),
        ),
      ],
    ),
  ];
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, this.bg, this.fg);

  final String text;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}
