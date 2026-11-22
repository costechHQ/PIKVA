/// The pupil's parent, so the school can contact the family (SRS 8). Parents
/// see themselves here; admins use it to reach the family.
class PupilParent {
  const PupilParent({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
  });

  final int id;
  final String name;
  final String email;
  final String phone;

  factory PupilParent.fromJson(Map<String, dynamic> json) => PupilParent(
    id: json['id'] as int,
    name: json['name'] as String,
    email: json['email'] as String,
    phone: json['phone'] as String,
  );
}

class Pupil {
  const Pupil({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.dateOfBirth,
    required this.photoUpdatedAt,
    this.parent,
  });

  final int id;
  final String firstName;
  final String lastName;
  final DateTime dateOfBirth;

  /// Null means no photo. Also serves as the photo's version for caching.
  final DateTime? photoUpdatedAt;

  /// Null if the server did not include the parent.
  final PupilParent? parent;

  String get fullName => '$firstName $lastName';
  bool get hasPhoto => photoUpdatedAt != null;

  String get initials {
    String first(String s) => s.isEmpty ? '' : s[0].toUpperCase();
    return '${first(firstName)}${first(lastName)}';
  }

  /// Whole years on [today].
  int ageOn(DateTime today) {
    var age = today.year - dateOfBirth.year;
    final hadBirthday =
        today.month > dateOfBirth.month ||
        (today.month == dateOfBirth.month && today.day >= dateOfBirth.day);
    if (!hadBirthday) age--;
    return age;
  }

  factory Pupil.fromJson(Map<String, dynamic> json) {
    final photo = json['photo_updated_at'] as String?;
    return Pupil(
      id: json['id'] as int,
      firstName: json['first_name'] as String,
      lastName: json['last_name'] as String,
      dateOfBirth: DateTime.parse(json['date_of_birth'] as String),
      photoUpdatedAt: photo == null ? null : DateTime.parse(photo),
      parent: json['parent'] == null
          ? null
          : PupilParent.fromJson(json['parent'] as Map<String, dynamic>),
    );
  }
}
