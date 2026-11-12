import '../../../history/domain/release.dart';
import '../../../pickers/domain/pickup_person.dart';
import '../../../pupils/domain/pupil.dart';
import '../../alerts/domain/security_alert.dart';

/// Most rows the dashboard reads for releases and alerts (the server's
/// largest page).
const dashboardLimit = 200;

/// How many items each dashboard panel lists.
const panelSize = 5;

/// A count read from at most [limit] rows: "200+" when the list was full,
/// since the real total may be higher.
String countText(int count, {int limit = dashboardLimit}) =>
    count >= limit ? '$limit+' : '$count';

/// Whether every row read fell on today, so older rows from today may have
/// been cut off and the count is only a lower bound.
bool mayHaveMore(int todayCount, int readCount, {int limit = dashboardLimit}) =>
    readCount >= limit && todayCount == readCount;

/// What the admin dashboard (SRS 18.3) shows, built from the existing list
/// endpoints. Everything that depends on "today" takes the time as a
/// parameter, in the phone's local day.
class DashboardData {
  const DashboardData({
    required this.pupils,
    required this.people,
    required this.releases,
    required this.openAlerts,
  });

  final List<Pupil> pupils;
  final List<PickupPerson> people;

  /// The latest releases, newest first (at most [dashboardLimit]).
  final List<Release> releases;
  final List<SecurityAlert> openAlerts;

  int get pupilCount => pupils.length;

  int get activePeople =>
      people.where((p) => p.status == PersonStatus.active).length;

  /// Pickup people the school still has to approve.
  List<PickupPerson> get waiting =>
      people.where((p) => p.status == PersonStatus.pendingApproval).toList();

  Map<int, String> get pupilNames => {for (final p in pupils) p.id: p.fullName};

  /// Releases that happened on [now]'s local day.
  List<Release> todaysReleases(DateTime now) {
    final n = now.toLocal();
    bool sameDay(DateTime t) {
      final l = t.toLocal();
      return l.year == n.year && l.month == n.month && l.day == n.day;
    }

    return releases.where((r) => sameDay(r.releasedAt)).toList();
  }

  /// Distinct pupils collected today, with "+" when the count may be low.
  String pickedUpToday(DateTime now) {
    final today = todaysReleases(now);
    final distinct = today.map((r) => r.pupilId).toSet().length;
    return mayHaveMore(today.length, releases.length)
        ? '$distinct+'
        : '$distinct';
  }

  String get openAlertsText => countText(openAlerts.length);

  bool get hasUrgentAlert => openAlerts.any((a) => a.isUrgent);
}
