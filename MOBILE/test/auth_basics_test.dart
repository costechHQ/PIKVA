import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/domain/current_user.dart';

Map<String, dynamic> _json(String role) => {
      'id': 7,
      'school_id': 1,
      'name': 'Ada Obi',
      'email': 'ada@example.com',
      'phone': '08012345678',
      'role': role,
      'school_name': 'Sunrise School',
    };

void main() {
  test('parses each backend role', () {
    expect(CurrentUser.fromJson(_json('parent')).role, UserRole.parent);
    expect(CurrentUser.fromJson(_json('gate_staff')).role, UserRole.gateStaff);
    expect(
      CurrentUser.fromJson(_json('school_admin')).role,
      UserRole.schoolAdmin,
    );
  });

  test('rejects an unknown role', () {
    expect(
      () => CurrentUser.fromJson(_json('superuser')),
      throwsFormatException,
    );
  });

  test('token store writes, reads and clears', () async {
    final store = MemoryTokenStore();
    expect(await store.read(), isNull);
    await store.write('abc');
    expect(await store.read(), 'abc');
    await store.clear();
    expect(await store.read(), isNull);
  });
}
