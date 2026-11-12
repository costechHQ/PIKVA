import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:pikva/core/api/api_client.dart';
import 'package:pikva/features/pupils/data/pupil_repository.dart';

/// A fake backend keyed by "METHOD /path". A body that is [Uint8List] is sent
/// as raw bytes (photos); anything else as JSON. Unknown routes answer 404.
class FakeBackend implements HttpClientAdapter {
  FakeBackend([Map<String, (int, Object)>? routes]) : routes = routes ?? {};

  final Map<String, (int, Object)> routes;
  final calls = <String>[];

  int count(String call) => calls.where((c) => c == call).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    final key = '${o.method} ${o.path}';
    calls.add(key);
    final hit = routes[key];
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

/// A pupil repository that finds nothing, for tests that are not about pupils.
PupilRepository stubPupils() => PupilRepository(apiFor(FakeBackend()));

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
