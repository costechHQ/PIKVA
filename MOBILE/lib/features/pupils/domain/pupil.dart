class Pupil {
  const Pupil({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.dateOfBirth,
    required this.photoUpdatedAt,
  });

  final int id;
  final String firstName;
  final String lastName;
  final DateTime dateOfBirth;

  /// Null means no photo. Also serves as the photo's version for caching.
  final DateTime? photoUpdatedAt;

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
    );
  }
}
