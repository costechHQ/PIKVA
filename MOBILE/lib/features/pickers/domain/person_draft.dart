import '../../../shared/form_result.dart';
import 'pickup_person.dart';

const nameMax = 150;
const phoneMax = 30;
const labelMax = 50;

/// Only suggestions: the backend accepts any type label.
const typeSuggestions = ['Regular', 'Temporary', 'One-off'];

/// What the parent has typed so far in the add/edit form. Times are the
/// phone's local time, as picked.
class PersonDraft {
  const PersonDraft({
    this.pupilId,
    this.name = '',
    this.phone = '',
    this.relationship = '',
    this.type = 'Regular',
    this.startsAt,
    this.expiresAt,
  });

  final int? pupilId;
  final String name;
  final String phone;
  final String relationship;
  final String type;
  final DateTime? startsAt;
  final DateTime? expiresAt;

  /// A new person starting now, with the end left for the parent to choose.
  factory PersonDraft.empty({int? pupilId, required DateTime now}) =>
      PersonDraft(pupilId: pupilId, startsAt: _toMinute(now));

  factory PersonDraft.from(PickupPerson p) => PersonDraft(
    pupilId: p.pupilId,
    name: p.name,
    phone: p.phone,
    relationship: p.relationship,
    type: p.type,
    startsAt: _toMinute(p.startsAt.toLocal()),
    expiresAt: _toMinute(p.expiresAt.toLocal()),
  );

  PersonDraft copyWith({
    int? pupilId,
    String? name,
    String? phone,
    String? relationship,
    String? type,
    DateTime? startsAt,
    DateTime? expiresAt,
  }) => PersonDraft(
    pupilId: pupilId ?? this.pupilId,
    name: name ?? this.name,
    phone: phone ?? this.phone,
    relationship: relationship ?? this.relationship,
    type: type ?? this.type,
    startsAt: startsAt ?? this.startsAt,
    expiresAt: expiresAt ?? this.expiresAt,
  );

  /// Checks the form and builds the request body: the full body for a new
  /// person, or only the changed fields when [original] is given (PATCH).
  /// Same rules and messages as the web app.
  PersonResult validate({required DateTime now, PickupPerson? original}) {
    final name = this.name.trim();
    final phone = this.phone.trim();
    final relationship = this.relationship.trim();
    final type = this.type.trim();
    final start = startsAt;
    final end = expiresAt;

    if (original == null && pupilId == null) {
      return const PersonResult.error(
        'Choose the pupil this person may collect.',
      );
    }
    if (name.isEmpty) {
      return const PersonResult.error("Enter the pickup person's name.");
    }
    if (name.length > nameMax) {
      return const PersonResult.error(
        'The name can be at most $nameMax characters.',
      );
    }
    if (phone.isEmpty) {
      return const PersonResult.error(
        "Enter the pickup person's phone number.",
      );
    }
    if (phone.length > phoneMax) {
      return const PersonResult.error(
        'The phone number can be at most $phoneMax characters.',
      );
    }
    if (relationship.isEmpty) {
      return const PersonResult.error(
        'Enter how this person is related to the pupil.',
      );
    }
    if (type.isEmpty) {
      return const PersonResult.error('Enter the type of authorisation.');
    }
    if (relationship.length > labelMax || type.length > labelMax) {
      return const PersonResult.error(
        'Relationship and type can be at most $labelMax characters.',
      );
    }
    if (start == null) {
      return const PersonResult.error(
        'Choose when this person may start collecting.',
      );
    }
    if (end == null) {
      return const PersonResult.error('Choose when this authorisation ends.');
    }
    if (!end.isAfter(start)) {
      return const PersonResult.error(
        'The end time must be after the start time.',
      );
    }
    if (original == null && !end.isAfter(now)) {
      return const PersonResult.error('The end time has already passed.');
    }

    if (original == null) {
      return PersonResult.ok({
        'pupil_id': pupilId,
        'picker_name': name,
        'picker_phone': phone,
        'relationship': relationship,
        'type': type,
        'starts_at': _utc(start),
        'expires_at': _utc(end),
      });
    }

    // Compare at the form's minute precision, so untouched times are never
    // resent (and an unchanged person never goes back to approval).
    final before = PersonDraft.from(original);
    final body = <String, Object?>{};
    if (name != original.name) body['picker_name'] = name;
    if (phone != original.phone) body['picker_phone'] = phone;
    if (relationship != original.relationship) {
      body['relationship'] = relationship;
    }
    if (type != original.type) body['type'] = type;
    if (!_toMinute(start).isAtSameMomentAs(before.startsAt!)) {
      body['starts_at'] = _utc(start);
    }
    if (!_toMinute(end).isAtSameMomentAs(before.expiresAt!)) {
      body['expires_at'] = _utc(end);
    }
    return PersonResult.ok(body);
  }

  static DateTime _toMinute(DateTime d) =>
      DateTime(d.year, d.month, d.day, d.hour, d.minute);

  static String _utc(DateTime local) =>
      _toMinute(local).toUtc().toIso8601String();
}

/// Kept as a name for readability at the call sites.
typedef PersonResult = FormResult;
