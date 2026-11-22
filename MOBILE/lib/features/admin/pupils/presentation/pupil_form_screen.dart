import 'package:flutter/material.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/photo_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/error_text.dart';
import '../../../../shared/format.dart';
import '../../../../shared/widgets/photo_chooser.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../../../pupils/domain/pupil.dart';
import '../../users/data/user_repository.dart';
import '../../users/domain/school_user.dart';
import '../domain/pupil_rules.dart';

/// Add a pupil ([original] null) or edit one. Pops the saved pupil, so the
/// screen behind can show it.
///
/// [onStored] is called when the details were saved but the form stays open
/// (the photo step failed), so the list behind can already show them.
class PupilFormScreen extends StatefulWidget {
  const PupilFormScreen({
    super.key,
    required this.pupils,
    required this.users,
    required this.photoPicker,
    this.original,
    this.onStored,
    this.clock = DateTime.now,
  });

  final PupilRepository pupils;
  final UserRepository users;
  final PhotoPicker photoPicker;
  final Pupil? original;
  final void Function(Pupil)? onStored;

  /// For tests.
  final DateTime Function() clock;

  @override
  State<PupilFormScreen> createState() => _PupilFormScreenState();
}

class _PupilFormScreenState extends State<PupilFormScreen> {
  late final TextEditingController _first = TextEditingController(
    text: widget.original?.firstName,
  );
  late final TextEditingController _last = TextEditingController(
    text: widget.original?.lastName,
  );
  final _parentFilter = TextEditingController();

  DateTime? _dob;
  bool _busy = false;
  String? _error;
  PhotoChoice _photo = const KeepPhoto();

  /// The pupil being edited. For a new pupil it is set as soon as their
  /// details are saved, so retrying a failed photo never adds them twice.
  Pupil? _original;

  // Parents to choose from (adding only).
  List<SchoolUser> _parents = const [];
  bool _loadingParents = false;
  Object? _parentsError;
  int? _parentId;

  bool get _editing => _original != null;

  @override
  void initState() {
    super.initState();
    _original = widget.original;
    _dob = _original?.dateOfBirth;
    if (!_editing) _loadParents();
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _parentFilter.dispose();
    super.dispose();
  }

  Future<void> _loadParents() async {
    setState(() {
      _loadingParents = true;
      _parentsError = null;
    });
    try {
      final parents = await widget.users.parents();
      if (!mounted) return;
      setState(() {
        _parents = parents;
        _loadingParents = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _parentsError = e;
        _loadingParents = false;
      });
    }
  }

  Future<void> _pickDob() async {
    final now = widget.clock();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 6, now.month, now.day),
      firstDate: DateTime(now.year - 25),
      lastDate: now,
      helpText: 'Date of birth',
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _choosePhoto(PhotoSource source) async {
    final PickedPhoto? picked;
    try {
      picked = await widget.photoPicker.pick(source);
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _error = source == PhotoSource.camera
            ? 'Could not open the camera. Check that Pikva may use it.'
            : 'Could not open your photos. Check that Pikva may use them.',
      );
      return;
    }
    if (picked == null || !mounted) return; // cancelled
    final chosen = picked;
    final problem = photoProblem(chosen);
    setState(() {
      _error = problem;
      if (problem == null) _photo = ReplacePhoto(chosen);
    });
  }

  Future<void> _save() async {
    final today = widget.clock();
    final result = _editing
        ? pupilChanges(
            _original!,
            firstName: _first.text,
            lastName: _last.text,
            dateOfBirth: _dob,
            today: today,
          )
        : newPupilBody(
            parentId: _parentId,
            firstName: _first.text,
            lastName: _last.text,
            dateOfBirth: _dob,
            today: today,
          );
    if (!result.isOk) {
      setState(() => _error = result.error);
      return;
    }
    final changes = result.body!;
    final detailsChanged = !_editing || changes.isNotEmpty;
    if (!detailsChanged && _photo is KeepPhoto) {
      Navigator.pop(context); // nothing changed, nothing to send
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    var pupil = _original;
    try {
      if (detailsChanged) {
        pupil = _editing
            ? await widget.pupils.update(_original!.id, changes)
            : await widget.pupils.create(changes);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _busy = false;
      });
      return;
    }

    // Either the details were just saved, or this is an edit with unchanged
    // details, so there is always a pupil by now.
    var saved = pupil!;
    final choice = _photo;
    if (choice is! KeepPhoto) {
      try {
        saved = choice is ReplacePhoto
            ? await widget.pupils.setPhoto(saved.id, choice.photo)
            : await widget.pupils.removePhoto(saved.id);
      } on ApiException catch (e) {
        if (!mounted) return;
        // The details are saved: stay on this pupil so a retry only repeats
        // the photo step.
        final stored = saved;
        widget.onStored?.call(stored);
        setState(() {
          _original = stored;
          _busy = false;
          _error =
              "${stored.fullName}'s details were saved, but the photo "
              '${choice is ReplacePhoto ? 'was not uploaded' : 'was not removed'}: '
              '${errorText(e)}';
        });
        return;
      }
    }

    if (!mounted) return;
    Navigator.pop(context, saved);
  }

  @override
  Widget build(BuildContext context) {
    final original = _original;
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? 'Edit pupil' : 'Add pupil')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (!_editing) ..._parentPicker(),
            TextField(
              controller: _first,
              enabled: !_busy,
              maxLength: pupilNameMax,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'First name',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _last,
              enabled: !_busy,
              maxLength: pupilNameMax,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Last name',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: _busy ? null : _pickDob,
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Date of birth',
                  suffixIcon: Icon(Icons.event_outlined),
                ),
                child: Text(_dob == null ? 'Choose a date' : formatDate(_dob!)),
              ),
            ),
            const SizedBox(height: 24),
            PhotoChooser(
              name: _first.text,
              current: original != null && original.hasPhoto
                  ? widget.pupils.photo(original)
                  : null,
              choice: _photo,
              busy: _busy,
              onPick: _choosePhoto,
              onChoice: (c) => setState(() => _photo = c),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.danger50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.danger600),
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(_editing ? 'Save changes' : 'Add pupil'),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _parentPicker() {
    if (_loadingParents) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }
    if (_parentsError != null) {
      return [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.danger50,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _parentsError is ApiException
                    ? (_parentsError as ApiException).message
                    : 'Could not load the parents.',
                style: const TextStyle(color: AppColors.danger600),
              ),
              TextButton(
                onPressed: _loadParents,
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
      ];
    }

    final shown = filterParents(_parents, _parentFilter.text);
    // Keep the chosen parent selectable even if the filter hides them.
    final chosen = _parents.where((p) => p.id == _parentId).toList();
    final items = [
      ...shown,
      for (final c in chosen)
        if (!shown.any((p) => p.id == c.id)) c,
    ];

    return [
      const Text('Parent', style: TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      if (_parents.isEmpty)
        const Text(
          'This school has no parents yet. Add the parent under Users first.',
          style: TextStyle(color: AppColors.inkMuted),
        )
      else ...[
        TextField(
          controller: _parentFilter,
          enabled: !_busy,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Find a parent',
            hintText: 'Name, email or phone',
            prefixIcon: Icon(Icons.search),
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<int>(
          initialValue: _parentId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Choose the parent'),
          items: [
            for (final p in items)
              DropdownMenuItem(
                value: p.id,
                child: Text(
                  '${p.name} · ${p.email}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: _busy ? null : (v) => setState(() => _parentId = v),
        ),
        if (shown.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'No parent matches.',
              style: TextStyle(color: AppColors.inkMuted),
            ),
          ),
      ],
      const SizedBox(height: 16),
    ];
  }
}
