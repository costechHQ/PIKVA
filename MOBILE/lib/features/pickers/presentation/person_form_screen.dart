import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/photo_chooser.dart';
import '../../pupils/domain/pupil.dart';
import '../data/picker_repository.dart';
import '../domain/person_draft.dart';
import '../domain/pickup_person.dart';

/// Opens the add form ([original] null) or the edit form. Returns the saved
/// person, or null if the parent backed out.
///
/// [onStored] is called when the details were saved but the form stays open
/// (the photo step failed), so the list behind it can already show them.
Future<PickupPerson?> showPersonForm(
  BuildContext context, {
  required PickerRepository repository,
  required PhotoPicker photoPicker,
  required List<Pupil> pupils,
  PickupPerson? original,
  int? initialPupilId,
  void Function(PickupPerson)? onStored,
}) {
  return Navigator.of(context).push<PickupPerson>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => PersonFormScreen(
        repository: repository,
        photoPicker: photoPicker,
        pupils: pupils,
        original: original,
        initialPupilId: initialPupilId,
        onStored: onStored,
      ),
    ),
  );
}

class PersonFormScreen extends StatefulWidget {
  const PersonFormScreen({
    super.key,
    required this.repository,
    required this.photoPicker,
    required this.pupils,
    this.original,
    this.initialPupilId,
    this.onStored,
    this.clock = DateTime.now,
  });

  final PickerRepository repository;
  final PhotoPicker photoPicker;
  final List<Pupil> pupils;
  final PickupPerson? original;
  final int? initialPupilId;
  final void Function(PickupPerson)? onStored;

  /// For tests.
  final DateTime Function() clock;

  @override
  State<PersonFormScreen> createState() => _PersonFormScreenState();
}

class _PersonFormScreenState extends State<PersonFormScreen> {
  late PersonDraft _draft;
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _relationship;
  late final TextEditingController _type;
  bool _busy = false;
  String? _error;

  /// The person being edited. For a new person it is set as soon as their
  /// details are saved, so retrying a failed photo never adds them twice.
  PickupPerson? _original;
  PhotoChoice _photo = const KeepPhoto();

  bool get _editing => _original != null;

  @override
  void initState() {
    super.initState();
    _original = widget.original;
    final pupilId =
        widget.initialPupilId ??
        (widget.pupils.length == 1 ? widget.pupils.first.id : null);
    _draft = _original != null
        ? PersonDraft.from(_original!)
        : PersonDraft.empty(pupilId: pupilId, now: widget.clock());
    _name = TextEditingController(text: _draft.name);
    _phone = TextEditingController(text: _draft.phone);
    _relationship = TextEditingController(text: _draft.relationship);
    _type = TextEditingController(text: _draft.type);
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _relationship.dispose();
    _type.dispose();
    super.dispose();
  }

  PersonDraft get _current => _draft.copyWith(
    name: _name.text,
    phone: _phone.text,
    relationship: _relationship.text,
    type: _type.text,
  );

  Future<DateTime?> _pickDateTime(DateTime? current, DateTime fallback) async {
    final initial = current ?? fallback;
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(initial.year - 1),
      lastDate: DateTime(initial.year + 5),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _pickStart() async {
    final picked = await _pickDateTime(_draft.startsAt, widget.clock());
    if (picked != null) {
      setState(() => _draft = _draft.copyWith(startsAt: picked));
    }
  }

  Future<void> _pickEnd() async {
    final start = _draft.startsAt ?? widget.clock();
    final picked = await _pickDateTime(
      _draft.expiresAt,
      start.add(const Duration(days: 1)),
    );
    if (picked != null) {
      setState(() => _draft = _draft.copyWith(expiresAt: picked));
    }
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
    final draft = _current;
    final result = draft.validate(now: widget.clock(), original: _original);
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

    var person = _original;
    try {
      if (detailsChanged) {
        person = _editing
            ? await widget.repository.update(_original!.id, changes)
            : await widget.repository.create(changes);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
      return;
    }

    // Either the details were just saved, or this is an edit with unchanged
    // details, so there is always a person by now.
    var saved = person!;
    final choice = _photo;
    if (choice is! KeepPhoto) {
      try {
        saved = choice is ReplacePhoto
            ? await widget.repository.setPhoto(saved.id, choice.photo)
            : await widget.repository.removePhoto(saved.id);
      } on ApiException catch (e) {
        if (!mounted) return;
        // The details are saved: stay on this person so a retry only repeats
        // the photo step.
        final stored = saved;
        widget.onStored?.call(stored);
        setState(() {
          _original = stored;
          _draft = PersonDraft.from(stored);
          _busy = false;
          _error =
              "${stored.name}'s details were saved, but the photo "
              '${choice is ReplacePhoto ? 'was not uploaded' : 'was not removed'}: '
              '${e.message}';
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
      appBar: AppBar(
        title: Text(_editing ? 'Edit pickup person' : 'Add pickup person'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.brand50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(_approvalNote(original)),
            ),
            const SizedBox(height: 16),
            if (!_editing) ...[
              DropdownButtonFormField<int>(
                initialValue: _draft.pupilId,
                decoration: const InputDecoration(labelText: 'Pupil'),
                items: [
                  for (final p in widget.pupils)
                    DropdownMenuItem(value: p.id, child: Text(p.fullName)),
                ],
                onChanged: _busy
                    ? null
                    : (v) =>
                          setState(() => _draft = _draft.copyWith(pupilId: v)),
              ),
              const SizedBox(height: 16),
            ],
            TextField(
              controller: _name,
              enabled: !_busy,
              maxLength: nameMax,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Full name',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phone,
              enabled: !_busy,
              maxLength: phoneMax,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Phone number',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _relationship,
              enabled: !_busy,
              maxLength: labelMax,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Relationship to pupil',
                hintText: 'e.g. Uncle, Grandmother, Driver',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _type,
              enabled: !_busy,
              maxLength: labelMax,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Type',
                counterText: '',
              ),
            ),
            Wrap(
              spacing: 8,
              children: [
                for (final t in typeSuggestions)
                  ActionChip(
                    label: Text(t),
                    onPressed: _busy
                        ? null
                        : () => setState(() => _type.text = t),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            _DateTimeField(
              label: 'Can collect from',
              value: _draft.startsAt,
              onTap: _busy ? null : _pickStart,
            ),
            const SizedBox(height: 16),
            _DateTimeField(
              label: 'Until',
              value: _draft.expiresAt,
              onTap: _busy ? null : _pickEnd,
            ),
            const SizedBox(height: 24),
            PhotoChooser(
              name: _name.text,
              current: original != null && original.hasPhoto
                  ? widget.repository.photo(original)
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
                  : Text(_editing ? 'Save changes' : 'Add person'),
            ),
          ],
        ),
      ),
    );
  }

  String _approvalNote(PickupPerson? original) {
    if (original == null) {
      return 'Your school will approve this person before they can collect.';
    }
    if (original.status == PersonStatus.pendingApproval) {
      return '${original.name} is still waiting for your school\'s approval.';
    }
    return 'If you save changes, ${original.name} cannot collect until your '
        'school approves them again, and any code you already got for them '
        'will stop working.';
  }
}

class _DateTimeField extends StatelessWidget {
  const _DateTimeField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final DateTime? value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: const Icon(Icons.event_outlined),
        ),
        child: Text(
          value == null ? 'Choose date and time' : formatDateTime(value!),
        ),
      ),
    );
  }
}
