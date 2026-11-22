import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/material.dart' show TextButton;
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/core/photo_picker.dart';
import 'package:pikva/core/qr_scanner.dart';
import 'package:pikva/core/repositories.dart';
import 'package:pikva/features/auth/data/auth_repository.dart';
import 'package:pikva/features/auth/data/token_store.dart';
import 'package:pikva/features/auth/presentation/auth_controller.dart';

/// A fake backend keyed by "METHOD /path". A body that is [Uint8List] is sent
/// as raw bytes (photos); anything else as JSON. Unknown routes answer 404.
class FakeBackend implements HttpClientAdapter {
  FakeBackend([Map<String, (int, Object)>? routes]) : routes = routes ?? {};

  final Map<String, (int, Object)> routes;
  final calls = <String>[];

  /// The query parameters of the last request to each "METHOD /path".
  final queries = <String, Map<String, dynamic>>{};

  /// Answers that depend on the request (paging). Checked before [routes].
  final handlers = <String, (int, Object) Function(RequestOptions)>{};

  /// The last request body sent to each "METHOD /path".
  final bodies = <String, Object?>{};

  int count(String call) => calls.where((c) => c == call).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    final key = '${o.method} ${o.path}';
    calls.add(key);
    bodies[key] = o.data;
    queries[key] = o.queryParameters;
    final hit = handlers[key]?.call(o) ?? routes[key];
    if (hit == null) {
      return ResponseBody.fromString(
        '{"detail":"Not found"}',
        404,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    final (status, body) = hit;
    if (body is Uint8List) {
      return ResponseBody.fromBytes(
        body,
        status,
        headers: {
          Headers.contentTypeHeader: ['image/jpeg'],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient apiFor(FakeBackend backend, {Future<String?> Function()? token}) =>
    ApiClient(
      baseUrl: 'http://test',
      tokenProvider: token,
      dio: Dio()..httpClientAdapter = backend,
    );

/// Repositories whose backend finds nothing, for tests not about data.
Repositories stubRepos() => Repositories.from(apiFor(FakeBackend()));

Map<String, dynamic> pupilJson({
  int id = 1,
  String first = 'Chidi',
  String last = 'Eze',
  String dob = '2018-03-12',
  String? photoUpdatedAt,
}) => {
  'id': id,
  'school_id': 1,
  'parent_id': 7,
  'parent': {
    'id': 7,
    'name': 'Ada Eze',
    'email': 'a@example.com',
    'phone': '08000000000',
  },
  'first_name': first,
  'last_name': last,
  'photo_url': null,
  'photo_updated_at': photoUpdatedAt,
  'date_of_birth': dob,
};

Map<String, dynamic> pickerJson({
  int id = 10,
  int pupilId = 1,
  String name = 'Grace Okafor',
  String relationship = 'Aunt',
  String type = 'permanent',
  bool isActive = true,
  String status = 'active',
  String? photoUpdatedAt,
}) => {
  'id': id,
  'pupil_id': pupilId,
  'picker_name': name,
  'picker_phone': '08011112222',
  'relationship': relationship,
  'photo_updated_at': photoUpdatedAt,
  'type': type,
  'starts_at': '2026-11-01T08:00:00Z',
  'expires_at': '2027-11-01T08:00:00Z',
  'is_active': isActive,
  'status': status,
  'approved_at': '2026-11-01T09:00:00Z',
  'created_at': '2026-11-01T07:00:00Z',
  'updated_at': '2026-11-01T07:00:00Z',
};

/// A signed-in parent talking to a fake backend. [routes] are added on top of
/// `/auth/me` and `/pupils` (Chidi and Amaka).
({FakeBackend backend, AuthController auth, Repositories repos}) parentApp(
  Map<String, (int, Object)> routes, {
  PhotoPicker? photoPicker,
  QrScanner? scanner,
  String role = 'parent',
}) {
  final backend = FakeBackend({
    'GET /auth/me': (
      200,
      {
        'id': 7,
        'school_id': 1,
        'name': 'Ada Eze',
        'email': 'a@example.com',
        'phone': '08000000000',
        'role': role,
        'school_name': 'Sunrise School',
      },
    ),
    'GET /pupils': (200, [pupilJson(), pupilJson(id: 2, first: 'Amaka')]),
    ...routes,
  });
  final tokens = MemoryTokenStore()..write('t');
  final api = apiFor(backend, token: tokens.read);
  return (
    backend: backend,
    auth: AuthController(AuthRepository(api: api, tokens: tokens)),
    repos: Repositories.from(api, photoPicker: photoPicker, scanner: scanner),
  );
}

/// Answers every pick with a canned result instead of opening the camera.
class FakePhotoPicker implements PhotoPicker {
  FakePhotoPicker({this.result, this.error});

  /// What the person "chooses"; null means they cancel.
  PickedPhoto? result;

  /// Thrown instead, as when permission is denied.
  Object? error;

  final requested = <PhotoSource>[];

  @override
  Future<PickedPhoto?> pick(PhotoSource source) async {
    requested.add(source);
    if (error != null) throw error!;
    return result;
  }
}

PickedPhoto jpegPhoto({String name = 'face.jpg', int size = 4}) =>
    PickedPhoto(bytes: Uint8List(size), name: name);

/// A stand-in for the camera: two buttons that "scan" a chosen text or fail.
class FakeQrScanner implements QrScanner {
  FakeQrScanner({this.text = '', this.errorMessage = 'Camera blocked'});

  String text;
  String errorMessage;

  @override
  Widget build(
    BuildContext context, {
    required ValueChanged<String> onScan,
    required ValueChanged<String> onError,
  }) => Column(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      TextButton(
        onPressed: () => onScan(text),
        child: const Text('Pretend scan'),
      ),
      TextButton(
        onPressed: () => onError(errorMessage),
        child: const Text('Pretend camera error'),
      ),
    ],
  );
}
