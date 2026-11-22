const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// 12 Mar 2018
String formatDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

/// 12 Nov 2026, 3:45 PM (in the phone's local time)
String formatDateTime(DateTime utcOrLocal) {
  final d = utcOrLocal.toLocal();
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minute = d.minute.toString().padLeft(2, '0');
  final suffix = d.hour < 12 ? 'AM' : 'PM';
  return '${formatDate(d)}, $hour12:$minute $suffix';
}

/// Groups a code in fours so it is easy to read aloud: ABCD EFGH
String formatCode(String code) {
  final buffer = StringBuffer();
  for (var i = 0; i < code.length; i += 4) {
    if (i > 0) buffer.write(' ');
    buffer.write(code.substring(i, i + 4 > code.length ? code.length : i + 4));
  }
  return buffer.toString();
}
