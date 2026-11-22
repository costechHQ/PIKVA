import '../../../pickers/domain/pickup_person.dart';
import '../../../pupils/domain/pupil.dart';
import '../../pupils/domain/pupil_rules.dart' show fold;

/// A pickup person with the pupil they collect (null if not found).
class PersonRow {
  const PersonRow(this.person, this.pupil);

  final PickupPerson person;
  final Pupil? pupil;
}

/// The status filter on the list: everyone, or one status.
class StatusFilter {
  const StatusFilter._(this.status);

  /// Null means every status.
  final PersonStatus? status;

  String get label => status?.label ?? 'All';

  static const all = StatusFilter._(null);

  /// The same order as the web app.
  static const values = [
    all,
    StatusFilter._(PersonStatus.active),
    StatusFilter._(PersonStatus.pendingApproval),
    StatusFilter._(PersonStatus.scheduled),
    StatusFilter._(PersonStatus.expired),
    StatusFilter._(PersonStatus.inactive),
  ];
}

/// Joins people to their pupils, sorted by the pickup person's name, then
/// the pupil's, ignoring case and accents.
List<PersonRow> personRows(List<PickupPerson> people, List<Pupil> pupils) {
  final byId = {for (final p in pupils) p.id: p};
  String key(PersonRow r) =>
      fold('${r.person.name} ${r.pupil?.fullName ?? ''}');
  final rows = [for (final p in people) PersonRow(p, byId[p.pupilId])];
  rows.sort((a, b) {
    final byName = key(a).compareTo(key(b));
    return byName != 0 ? byName : a.person.id.compareTo(b.person.id);
  });
  return rows;
}

/// Rows with this status (null: all) whose pickup person's name or phone, or
/// pupil's name, contains every word of [search], ignoring case and accents.
List<PersonRow> filterPersonRows(
  List<PersonRow> rows,
  StatusFilter filter,
  String search,
) {
  final words = fold(search)
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  return [
    for (final r in rows)
      if ((filter.status == null || r.person.status == filter.status) &&
          _matches(r, words))
        r,
  ];
}

bool _matches(PersonRow r, List<String> words) {
  final text = fold(
    '${r.person.name} ${r.person.phone} ${r.pupil?.fullName ?? ''}',
  );
  return words.every(text.contains);
}

/// How many people have each status.
Map<PersonStatus, int> statusCounts(List<PersonRow> rows) {
  final counts = <PersonStatus, int>{};
  for (final r in rows) {
    counts[r.person.status] = (counts[r.person.status] ?? 0) + 1;
  }
  return counts;
}
