import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/features/auth/data/auth_repository.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/presentation/auth_controller.dart';
import 'package:pikva/main.dart';

void main() {
  testWidgets('with no saved token the app shows the login screen',
      (tester) async {
    final tokens = MemoryTokenStore();
    final api = ApiClient(baseUrl: 'http://test', dio: Dio());
    final auth = AuthController(AuthRepository(api: api, tokens: tokens));

    await tester.pumpWidget(PikvaApp(auth: auth));
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsNWidgets(2)); // heading + button
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });
}
