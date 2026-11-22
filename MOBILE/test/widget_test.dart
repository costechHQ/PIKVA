import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/main.dart';

void main() {
  testWidgets('app starts and shows the Pikva title', (tester) async {
    await tester.pumpWidget(const PikvaApp());
    expect(find.text('Pikva'), findsOneWidget);
  });
}
