import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/format.dart';
import '../../pupils/domain/pupil.dart';
import '../data/picker_repository.dart';
import '../domain/person_draft.dart';
import '../domain/pickup_person.dart';

/// Opens the add form ([original] null) or the edit form. Returns the saved
/// person, or null if the parent backed out.
Future<PickupPerson?> showPersonForm(
  BuildContext context, {
  required PickerRepository repository,
  required List<Pupil> pupils,
  PickupPerson? original,
  int? initialPupilId,
}) {
  return Navigator.of(context).push<PickupPerson>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => PersonFormScreen(
        repository: repository,
        pupils: pupils,
        original: original,
        initialPupilId: initialPupilId,
      ),
    ),
  );
}

class PersonFormScreen extends StatefulWidget {
  const PersonFormScreen({
    super.key,
    required this.repository,
    required this.pupils,
    this.original,
    this.initialPupilId,
    this.clock = DateTime.now,
  });

  final PickerRepository repository;
  final List<Pupil> pupils;
  final PickupPerson? original;
  final int? initialPupilId;

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

  bool get _editing => widget.original != null;

  @override
  void initState() {
    super.initState();
    final original = widget.original;
    final pupilId =
        widget.initialPupilId ??
        (widget.pupils.length == 1 ? widget.pupils.first.id : null);
    _draft = original != null
        ? PersonDraft.from(original)
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

  Future<void> _save() async {
    final draft = _current;
    final result = draft.validate(
      now: widget.clock(),
      original: widget.original,
    );
    if (!result.isOk) {
      setState(() => _error = result.error);
      return;
    }
    final changes = result.body!;
    if (_editing && changes.isEmpty) {
      Navigator.pop(context); // nothing changed, nothing to send
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final saved = _editing
          ? await widget.repository.update(widget.original!.id, changes)
          : await widget.repository.create(changes);
      if (!mounted) return;
      Navigator.pop(context, saved);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final original = widget.original;
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
