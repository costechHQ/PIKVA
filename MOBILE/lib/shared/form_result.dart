/// Either a request body or the first thing wrong with a form.
class FormResult {
  const FormResult.ok(Map<String, Object?> this.body) : error = null;
  const FormResult.error(String this.error) : body = null;

  final Map<String, Object?>? body;
  final String? error;

  bool get isOk => body != null;
}
