import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/core/api/api_config.dart';
import 'package:pikva/main.dart';

void main() {
  group('ApiConfig.releaseProblem', () {
    test('a normal https address is fine', () {
      expect(
        ApiConfig.releaseProblem('https://api.pikva.example/api/v1'),
        isNull,
      );
      expect(
        ApiConfig.releaseProblem('https://school.example.com:8443/api/v1'),
        isNull,
      );
    });

    test('plain http is refused (Android blocks it in release builds)', () {
      expect(
        ApiConfig.releaseProblem('http://api.pikva.example/api/v1'),
        contains('https'),
      );
    });

    test('the emulator and local addresses are refused even over https', () {
      for (final url in [
        'https://10.0.2.2/api/v1',
        'https://localhost/api/v1',
        'https://127.0.0.1:8000/api/v1',
        'https://0.0.0.0/api/v1',
      ]) {
        expect(ApiConfig.releaseProblem(url), contains('only the developer'));
      }
    });

    test(
      'the built-in default is refused, so it can never ship by accident',
      () {
        expect(ApiConfig.releaseProblem(ApiConfig.baseUrl), isNotNull);
      },
    );

    test('garbage is refused', () {
      expect(ApiConfig.releaseProblem(''), contains('not a valid'));
      expect(ApiConfig.releaseProblem('not a url'), contains('not a valid'));
      expect(ApiConfig.releaseProblem('https://'), contains('not a valid'));
    });
  });

  testWidgets('the config problem screen says how to fix the build', (
    tester,
  ) async {
    await tester.pumpWidget(const ConfigProblemApp('This build points at x.'));

    expect(find.textContaining('wrong server address'), findsOneWidget);
    expect(find.textContaining('This build points at x.'), findsOneWidget);
    expect(
      find.textContaining('--dart-define=API_BASE_URL=https://'),
      findsOneWidget,
    );
    expect(find.byType(Scaffold), findsOneWidget);
  });
}
