import '../../../../shared/form_result.dart';
import '../../../pupils/domain/pupil.dart';
import '../../users/domain/school_user.dart';

const pupilNameMax = 100;

/// `YYYY-MM-DD`, the format the server takes for a date of birth.
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

String? _problem(String first, String last, DateTime? dob, DateTime today) {
  if (first.isEmpty || last.isEmpty) {
    return "Enter the pupil's first and last name.";
  }
  if (first.length > pupilNameMax || last.length > pupilNameMax) {
    return 'Names can be at most $pupilNameMax characters.';
  }
  if (dob == null) return "Enter the pupil's date of birth.";
  if (isoDate(dob).compareTo(isoDate(today)) > 0) {
    return 'The date of birth cannot be in the future.';
  }
  return null;
}

/// Checks the Add pupil form and builds the POST body. [today] is the
/// phone's calendar day. The server checks the parent belongs to the school.
FormResult newPupilBody({
  required int? parentId,
  required String firstName,
  required String lastName,
  required DateTime? dateOfBirth,
  required DateTime today,
}) {
  if (parentId == null) {
    return const FormResult.error("Choose the pupil's parent.");
  }
  final first = firstName.trim();
  final last = lastName.trim();
  final problem = _problem(first, last, dateOfBirth, today);
  if (problem != null) return FormResult.error(problem);
  return FormResult.ok({
    'parent_id': parentId,
    'first_name': first,
    'last_name': last,
    'date_of_birth': isoDate(dateOfBirth!),
  });
}

/// Checks the edit form and returns only the fields that changed. An empty
/// body means nothing changed.
FormResult pupilChanges(
  Pupil pupil, {
  required String firstName,
  required String lastName,
  required DateTime? dateOfBirth,
  required DateTime today,
}) {
  final first = firstName.trim();
  final last = lastName.trim();
  final problem = _problem(first, last, dateOfBirth, today);
  if (problem != null) return FormResult.error(problem);
  final dob = isoDate(dateOfBirth!);
  return FormResult.ok({
    if (first != pupil.firstName) 'first_name': first,
    if (last != pupil.lastName) 'last_name': last,
    if (dob != isoDate(pupil.dateOfBirth)) 'date_of_birth': dob,
  });
}

/// Each base letter and the accented forms that should match it, including
/// the dotted vowels common in Nigerian names.
const _accents = {
  'a': 'àáâãäåāăąạ',
  'c': 'çćč',
  'd': 'ď',
  'e': 'èéêëēėęěẹệ',
  'i': 'ìíîïīįịı',
  'n': 'ñńň',
  'o': 'òóôõöøōőọộ',
  's': 'šśşṣ',
  'u': 'ùúûüūůűųụ',
  'y': 'ýÿ',
  'z': 'žźż',
};

final Map<int, String> _base = {
  for (final e in _accents.entries)
    for (final r in e.value.runes) r: e.key,
};

/// Lower case without accents, so "chidi" finds "Chídí". Dart has no
/// built-in normaliser, so this covers the Latin letters names use and also
/// drops any combining accent marks.
String fold(String text) {
  final b = StringBuffer();
  for (final r in text.toLowerCase().runes) {
    if (r >= 0x300 && r <= 0x36f) continue; // combining accent marks
    b.write(_base[r] ?? String.fromCharCode(r));
  }
  return b.toString();
}

List<String> _words(String text) =>
    fold(text).split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

/// Pupils whose name or parent's name contains every word of [search],
/// ignoring case and accents. An empty search keeps everyone.
List<Pupil> searchPupils(List<Pupil> pupils, String search) {
  final words = _words(search);
  if (words.isEmpty) return List.of(pupils);
  return [
    for (final p in pupils)
      if (_hasAll('${p.fullName} ${p.parent?.name ?? ''}', words)) p,
  ];
}

/// Parents whose name, email or phone contains every word of [filter].
List<SchoolUser> filterParents(List<SchoolUser> parents, String filter) {
  final words = _words(filter);
  if (words.isEmpty) return List.of(parents);
  return [
    for (final p in parents)
      if (_hasAll('${p.name} ${p.email} ${p.phone}', words)) p,
  ];
}

bool _hasAll(String text, List<String> words) {
  final folded = fold(text);
  return words.every(folded.contains);
}
