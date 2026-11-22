import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pikva/features/admin/audit/data/audit_repository.dart';
import 'package:pikva/features/admin/audit/domain/audit_record.dart';
import 'package:pikva/main.dart';

import 'support/fakes.dart';

Map<String, dynamic> auditJson({
  int id = 1,
  String action = 'pupil.updated',
  String entityType = 'pupil',
  int? entityId = 1,
  Map<String, dynamic>? metadata,
  String? actor = 'Ada Admin',
  String createdAt = '2026-11-20T10:00:00Z',
}) => {
  'id': id,
  'user': actor == null ? null : {'id': 5, 'name': actor},
  'action': action,
  'entity_type': entityType,
  'entity_id': entityId,
  'metadata': metadata,
  'created_at': createdAt,
};

void main() {
  group('actionLabel', () {
    test('every action has plain wording', () {
      expect(actionLabel('user.created'), 'Added a user');
      expect(actionLabel('pupil.released'), 'Released a pupil');
      expect(actionLabel('pickup.refused'), 'Refused a pickup');
      expect(actionLabels.length, 22);
    });

    test('an action from a newer backend is shown as written', () {
      expect(actionLabel('something.new'), 'something.new');
    });
  });

  group('AuditRecord', () {
    test('parses the API row, with or without a person', () {
      final r = AuditRecord.fromJson(auditJson());
      expect(r.userName, 'Ada Admin');
      expect(r.actionText, 'Changed a pupil');
      expect(AuditRecord.fromJson(auditJson(actor: null)).userName, isNull);
    });
  });

  group('auditNotes', () {
    test('no metadata, no notes', () {
      expect(auditNotes(null), isEmpty);
      expect(auditNotes({}), isEmpty);
    });

    test('changed fields use plain names', () {
      expect(
        auditNotes({
          'fields': ['first_name', 'date_of_birth', 'picker_phone'],
        }),
        ['Changed: first name, date of birth, phone'],
      );
    });

    test('approval reset, email result and role', () {
      expect(auditNotes({'approval_reset': true}), [
        'Needs school approval again',
      ]);
      expect(auditNotes({'sent': true}), ['Email sent']);
      expect(auditNotes({'sent': false}), ['Email could not be sent']);
      expect(auditNotes({'role': 'gate_staff'}), ['Role: gate staff']);
      expect(auditNotes({'role': 'school_admin', 'via': 'registration'}), [
        'Role: administrator (registered the school)',
      ]);
    });

    test('gate details', () {
      expect(
        auditNotes({
          'result': 'used_code',
          'method': 'qr',
          'stage': 'release',
          'code_date': '2026-11-20',
        }),
        ['Code used again', 'QR code', 'At release', 'For 2026-11-20'],
      );
      expect(auditNotes({'verification_method': 'manual'}), ['Code entered']);
      expect(auditNotes({'stage': 'refuse'}), ['At refusal']);
      expect(auditNotes({'stage': 'verify'}), ['At check']);
      expect(auditNotes({'alert_type': 'pickup_refused'}), [
        'Pickup refused at the gate',
      ]);
    });

    test('unknown fields and roles are shown as written', () {
      expect(
        auditNotes({
          'fields': ['mystery'],
        }),
        ['Changed: mystery'],
      );
      expect(auditNotes({'role': 'wizard'}), ['Role: wizard']);
    });
  });

  group('auditLinks', () {
    test('a pupil record is about that pupil', () {
      final l = auditLinks(AuditRecord.fromJson(auditJson(entityId: 4)));
      expect(l.pupilId, 4);
      expect(l.authorisationId, isNull);
    });

    test('a pickup person record is about that person', () {
      final l = auditLinks(
        AuditRecord.fromJson(
          auditJson(entityType: 'pickup_authorisation', entityId: 9),
        ),
      );
      expect(l.authorisationId, 9);
      expect(l.pupilId, isNull);
    });

    test('other records take the ids from the metadata', () {
      final l = auditLinks(
        AuditRecord.fromJson(
          auditJson(
            entityType: 'release',
            entityId: 77,
            metadata: {'pupil_id': 2, 'authorisation_id': 10},
          ),
        ),
      );
      expect(l.pupilId, 2);
      expect(l.authorisationId, 10);
    });
  });

  group('AuditRepository', () {
    test('asks for one extra row and the action filter', () async {
      final rows = [for (var i = 0; i < 26; i++) auditJson(id: i)];
      final backend = FakeBackend({'GET /audit-logs': (200, rows)});
      final page = await AuditRepository(apiFor(backend))
          .list(action: 'pupil.updated', offset: 25);

      expect(page.records, hasLength(25));
      expect(page.hasMore, isTrue);
      final q = backend.queries['GET /audit-logs']!;
      expect(q['limit'], 26);
      expect(q['offset'], 25);
      expect(q['action'], 'pupil.updated');
    });

    test('no action sends no filter', () async {
      final backend = FakeBackend({'GET /audit-logs': (200, [])});
      await AuditRepository(apiFor(backend)).list();
      expect(
        backend.queries['GET /audit-logs']!.containsKey('action'),
        isFalse,
      );
    });
  });

  group('audit log screen', () {
    Future<({FakeBackend backend})> openAudit(
      WidgetTester tester,
      Map<String, (int, Object)> routes,
    ) async {
      tester.view.physicalSize = const Size(800, 3500);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final a = parentApp({
        'GET /pickers': (200, [pickerJson()]),
        'GET /releases': (200, []),
        'GET /alerts': (200, []),
        ...routes,
      }, role: 'school_admin');
      await tester.pumpWidget(PikvaApp(auth: a.auth, repos: a.repos));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'More'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Audit log'));
      await tester.pumpAndSettle();
      return (backend: a.backend);
    }

    testWidgets('shows who did what, to whom, with notes', (tester) async {
      await openAudit(tester, {
        'GET /audit-logs': (
          200,
          [
            auditJson(
              metadata: {
                'fields': ['first_name'],
              },
            ),
            auditJson(
              id: 2,
              action: 'pickup_authorisation.approved',
              entityType: 'pickup_authorisation',
              entityId: 10,
              actor: null,
              metadata: {'approval_reset': true},
            ),
            auditJson(
              id: 3,
              action: 'user.created',
              entityType: 'user',
              entityId: 42,
            ),
          ],
        ),
      });

      expect(find.text('Changed a pupil'), findsOneWidget);
      expect(find.text('Ada Admin'), findsNWidgets(2));
      expect(find.text('Chidi Eze'), findsOneWidget); // the pupil, by name
      expect(find.text('Changed: first name'), findsOneWidget);

      expect(find.text('Approved a pickup person'), findsOneWidget);
      expect(find.text('System'), findsOneWidget);
      expect(find.text('Grace Okafor'), findsOneWidget); // the person, by name
      expect(find.text('Needs school approval again'), findsOneWidget);

      expect(find.text('Added a user'), findsOneWidget);
      expect(find.text('user #42'), findsOneWidget);
    });

    testWidgets('names it cannot find show as numbers', (tester) async {
      await openAudit(tester, {
        'GET /audit-logs': (
          200,
          [
            auditJson(entityId: 99),
            auditJson(
              id: 2,
              action: 'pickup_authorisation.updated',
              entityType: 'pickup_authorisation',
              entityId: 98,
            ),
          ],
        ),
      });

      expect(find.text('Pupil #99'), findsOneWidget);
      expect(find.text('Pickup person #98'), findsOneWidget);
    });

    testWidgets('records still show if the names cannot be loaded', (
      tester,
    ) async {
      await openAudit(tester, {
        'GET /audit-logs': (200, [auditJson()]),
        'GET /pickers': (500, {'detail': 'boom'}),
      });

      expect(find.text('Changed a pupil'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('the action filter reloads with the chosen action', (
      tester,
    ) async {
      final g = await openAudit(tester, {
        'GET /audit-logs': (200, [auditJson()]),
      });
      expect(
        g.backend.queries['GET /audit-logs']!.containsKey('action'),
        isFalse,
      );

      await tester.tap(find.text('All actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Released a pupil').last);
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /audit-logs']!['action'], 'pupil.released');
    });

    testWidgets('a pupil name opens that pupil', (tester) async {
      await openAudit(tester, {
        'GET /audit-logs': (200, [auditJson()]),
        'GET /pupils/1': (200, pupilJson()),
      });

      await tester.tap(find.text('Chidi Eze'));
      await tester.pumpAndSettle();

      expect(find.text('Edit pupil'), findsOneWidget);
    });

    testWidgets('empty and error states', (tester) async {
      final g = await openAudit(tester, {'GET /audit-logs': (200, [])});
      expect(find.text('No records for this action yet.'), findsOneWidget);

      g.backend.routes['GET /audit-logs'] = (500, {'detail': 'boom'});
      await tester.tap(find.text('All actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Added a user').last);
      await tester.pumpAndSettle();
      expect(find.text('Try again'), findsOneWidget);

      g.backend.routes['GET /audit-logs'] = (200, [auditJson()]);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Changed a pupil'), findsOneWidget);
    });

    testWidgets('Show older loads the next page', (tester) async {
      final g = await openAudit(tester, {'GET /audit-logs': (200, [])});
      tester.view.physicalSize = const Size(800, 12000);
      g.backend.handlers['GET /audit-logs'] = (o) {
        final offset = o.queryParameters['offset'] as int;
        final count = offset == 0 ? 26 : 2;
        return (
          200,
          [
            for (var i = 0; i < count; i++)
              auditJson(
                id: offset + i + 1,
                action: 'user.created',
                entityType: 'user',
                entityId: offset + i + 1,
              ),
          ],
        );
      };
      await tester.tap(find.text('All actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Added a user').last);
      await tester.pumpAndSettle();

      expect(find.textContaining('user #'), findsNWidgets(25));
      await tester.ensureVisible(find.text('Show older'));
      await tester.tap(find.text('Show older'));
      await tester.pumpAndSettle();

      expect(g.backend.queries['GET /audit-logs']!['offset'], 25);
      expect(find.textContaining('user #'), findsNWidgets(27));
      expect(find.text('Show older'), findsNothing);
    });

    testWidgets('the back arrow returns to the More menu', (tester) async {
      await openAudit(tester, {'GET /audit-logs': (200, [])});

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(find.text('Account'), findsOneWidget);
    });
  });
}
