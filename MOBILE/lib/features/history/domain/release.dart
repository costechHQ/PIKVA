import '../../../shared/format.dart';

/// One time a pupil was collected at the gate (`GET /releases`). Parents are
/// never told which staff member released the pupil (SRS 18.9), so there is
/// no staff field.
class Release {
  const Release({
    required this.id,
    required this.pupilId,
    required this.pupilFirstName,
    required this.pupilLastName,
    required this.pickerName,
    required this.relationship,
    required this.viaQr,
    required this.releasedAt,
  });

  final int id;
  final int pupilId;
  final String pupilFirstName;
  final String pupilLastName;
  final String pickerName;
  final String relationship;

  /// True if the code was scanned, false if it was typed in.
  final bool viaQr;
  final DateTime releasedAt;

  String get pupilName => '$pupilFirstName $pupilLastName';

  String get methodLabel => viaQr ? 'QR code' : 'Code entered';

  factory Release.fromJson(Map<String, dynamic> json) {
    final pupil = json['pupil'] as Map<String, dynamic>;
    final picker = json['authorisation'] as Map<String, dynamic>;
    return Release(
      id: json['id'] as int,
      pupilId: pupil['id'] as int,
      pupilFirstName: pupil['first_name'] as String,
      pupilLastName: pupil['last_name'] as String,
      pickerName: picker['picker_name'] as String,
      relationship: picker['relationship'] as String,
      viaQr: json['verification_method'] == 'qr',
      releasedAt: DateTime.parse(json['released_at'] as String),
    );
  }
}

/// Releases that happened on the same local day.
class ReleaseDay {
  const ReleaseDay(this.label, this.releases);

  final String label;
  final List<Release> releases;
}

/// Groups newest-first [releases] into days, in the phone's local time.
List<ReleaseDay> groupReleasesByDay(List<Release> releases, DateTime now) {
  final days = <ReleaseDay>[];
  DateTime? currentKey;
  for (final r in releases) {
    final local = r.releasedAt.toLocal();
    final key = DateTime(local.year, local.month, local.day);
    if (currentKey != key) {
      days.add(ReleaseDay(formatDayLabel(local, now), []));
      currentKey = key;
    }
    days.last.releases.add(r);
  }
  return days;
}
