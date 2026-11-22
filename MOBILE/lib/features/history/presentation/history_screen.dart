import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/photo_avatar.dart';
import '../../pupils/data/pupil_repository.dart';
import '../../pupils/domain/pupil.dart';
import '../data/release_repository.dart';
import '../domain/release.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({
    super.key,
    required this.pupils,
    required this.releases,
    this.clock = DateTime.now,
  });

  final PupilRepository pupils;
  final ReleaseRepository releases;

  /// For tests.
  final DateTime Function() clock;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  String? _moreError;

  List<Pupil> _pupils = const [];
  List<Release> _items = const [];
  bool _hasMore = false;

  int? _pupilId;
  DateTime? _day;

  // Bumped on every fresh load so a slow, older answer cannot overwrite a
  // newer filter's results.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _start(first: true);
  }

  Future<void> _start({bool first = false}) async {
    final gen = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _moreError = null;
    });
    try {
      final pupils = first || _pupils.isEmpty
          ? await widget.pupils.list()
          : _pupils;
      final page = pupils.isEmpty
          ? const ReleasePage(releases: [], hasMore: false)
          : await widget.releases.list(pupilId: _pupilId, day: _day);
      if (!mounted || gen != _generation) return;
      setState(() {
        _pupils = pupils;
        _items = page.releases;
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
      final page = await widget.releases.list(
        pupilId: _pupilId,
        day: _day,
        offset: _items.length,
      );
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = [..._items, ...page.releases];
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } on ApiException catch (e) {
      if (!mounted || gen != _generation) return;
      setState(() {
        _moreError = e.message;
        _loadingMore = false;
      });
    }
  }

  void _selectPupil(int? id) {
    if (id == _pupilId) return;
    _pupilId = id;
    _start();
  }

  Future<void> _pickDay() async {
    final now = widget.clock();
    final picked = await showDatePicker(
      context: context,
      initialDate: _day ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      helpText: 'Show pickups on',
    );
    if (picked == null) return;
    _day = picked;
    _start();
  }

  void _clearDay() {
    _day = null;
    _start();
  }

  Pupil? _pupilFor(Release r) {
    for (final p in _pupils) {
      if (p.id == r.pupilId) return p;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pickup history')),
      body: _body(),
    );
  }

  Widget _body() {
    if (_error != null && _pupils.isEmpty) {
      return ErrorView(error: _error!, onRetry: () => _start(first: true));
    }
    if (_loading && _pupils.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_pupils.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No children yet. Pickups appear here once your school links a '
            'child to your account.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _start(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_pupils.length > 1) _pupilChips(),
          _dayFilter(),
          const SizedBox(height: 8),
          ..._results(),
        ],
      ),
    );
  }

  Widget _pupilChips() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _chip('All children', _pupilId == null, () => _selectPupil(null)),
            for (final p in _pupils)
              _chip(p.firstName, _pupilId == p.id, () => _selectPupil(p.id)),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
      ),
    );
  }

  Widget _dayFilter() {
    final day = _day;
    return Row(
      children: [
        OutlinedButton.icon(
          onPressed: _pickDay,
          icon: const Icon(Icons.event_outlined),
          label: Text(day == null ? 'Pick a day' : formatDate(day)),
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
        ),
        if (day != null) ...[
          const SizedBox(width: 8),
          TextButton(onPressed: _clearDay, child: const Text('All days')),
        ],
      ],
    );
  }

  List<Widget> _results() {
    if (_loading) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 48),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }
    if (_error != null) {
      return [
        SizedBox(
          height: 240,
          child: ErrorView(error: _error!, onRetry: () => _start()),
        ),
      ];
    }
    if (_items.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: Text(
            _day != null
                ? 'No pickups on this day.'
                : 'No pickups recorded yet. When a child is collected at the '
                      'gate, it will appear here.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.inkMuted),
          ),
        ),
      ];
    }

    final now = widget.clock();
    return [
      for (final day in groupReleasesByDay(_items, now)) ...[
        Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: Text(
            day.label.toUpperCase(),
            style: Theme.of(context).textTheme.labelMedium
                ?.copyWith(color: AppColors.inkMuted, letterSpacing: 1),
          ),
        ),
        Card(
          child: Column(
            children: [
              for (var i = 0; i < day.releases.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                _ReleaseTile(
                  release: day.releases[i],
                  pupil: _pupilFor(day.releases[i]),
                  repository: widget.pupils,
                ),
              ],
            ],
          ),
        ),
      ],
      if (_moreError != null)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(
            _moreError!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.danger600),
          ),
        ),
      if (_hasMore)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Center(
            child: OutlinedButton(
              onPressed: _loadingMore ? null : _loadMore,
              child: Text(_loadingMore ? 'Loading…' : 'Show older'),
            ),
          ),
        ),
    ];
  }
}

class _ReleaseTile extends StatelessWidget {
  const _ReleaseTile({
    required this.release,
    required this.pupil,
    required this.repository,
  });

  final Release release;
  final Pupil? pupil;
  final PupilRepository repository;

  @override
  Widget build(BuildContext context) {
    final p = pupil;
    final initials =
        '${release.pupilFirstName.isEmpty ? '' : release.pupilFirstName[0]}'
                '${release.pupilLastName.isEmpty ? '' : release.pupilLastName[0]}'
            .toUpperCase();
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PhotoAvatar(
            initials: initials,
            photo: p != null && p.hasPhoto ? repository.photo(p) : null,
            radius: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  release.pupilName,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                Text(
                  'Picked up by ${release.pickerName} '
                  '(${release.relationship})',
                  style: const TextStyle(color: AppColors.inkMuted),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.success50,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Collected · ${release.methodLabel}',
                    style: const TextStyle(
                      color: AppColors.success600,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatTime(release.releasedAt),
            style: Theme.of(context).textTheme.titleSmall,
          ),
        ],
      ),
    );
  }
}
