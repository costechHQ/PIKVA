import '../../../pickers/domain/pickup_person.dart';
import '../../../pupils/domain/pupil.dart';

/// A pickup person waiting for school approval, with the pupil they would
/// collect (null if that pupil cannot be found).
class ApprovalRequest {
  const ApprovalRequest(this.person, this.pupil);

  final PickupPerson person;
  final Pupil? pupil;
}

/// The people awaiting approval, longest-waiting first. `updated_at` is when
/// the parent last changed them, which is when they started waiting.
List<ApprovalRequest> pendingApprovals(
  List<PickupPerson> people,
  List<Pupil> pupils,
) {
  final byId = {for (final p in pupils) p.id: p};
  final waiting =
      people.where((p) => p.status == PersonStatus.pendingApproval).toList()
        ..sort((a, b) {
          final byTime = a.updatedAt.compareTo(b.updatedAt);
          return byTime != 0 ? byTime : a.id.compareTo(b.id);
        });
  return [for (final p in waiting) ApprovalRequest(p, byId[p.pupilId])];
}
