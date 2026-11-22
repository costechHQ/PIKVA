import '../../../history/data/release_repository.dart';
import '../../../pickers/data/picker_repository.dart';
import '../../../pupils/data/pupil_repository.dart';
import '../../alerts/data/alert_repository.dart';
import '../domain/dashboard_data.dart';

/// Gathers the four lists the dashboard summarises. Admins get their whole
/// school from each.
class DashboardRepository {
  const DashboardRepository({
    required this.pupils,
    required this.pickers,
    required this.releases,
    required this.alerts,
  });

  final PupilRepository pupils;
  final PickerRepository pickers;
  final ReleaseRepository releases;
  final AlertRepository alerts;

  Future<DashboardData> load() async {
    final (pupilList, peopleList, releaseList, alertList) = await (
      pupils.list(),
      pickers.list(),
      releases.latest(dashboardLimit),
      alerts.open(dashboardLimit),
    ).wait;
    return DashboardData(
      pupils: pupilList,
      people: peopleList,
      releases: releaseList,
      openAlerts: alertList,
    );
  }
}
