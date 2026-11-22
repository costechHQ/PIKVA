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

/// 3:45 PM (in the phone's local time)
String formatTime(DateTime utcOrLocal) {
  final d = utcOrLocal.toLocal();
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minute = d.minute.toString().padLeft(2, '0');
  return '$hour12:$minute ${d.hour < 12 ? 'AM' : 'PM'}';
}

const _weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const _longMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/// Today, Yesterday, or "Tuesday, 3 November" (with the year when it is not
/// this year). [day] and [now] are compared in the phone's local time.
String formatDayLabel(DateTime day, DateTime now) {
  final d = day.toLocal();
  final n = now.toLocal();
  final dKey = DateTime(d.year, d.month, d.day);
  final today = DateTime(n.year, n.month, n.day);
  if (dKey == today) return 'Today';
  if (dKey == DateTime(n.year, n.month, n.day - 1)) return 'Yesterday';
  final base =
      '${_weekdays[d.weekday - 1]}, ${d.day} ${_longMonths[d.month - 1]}';
  return d.year == n.year ? base : '$base ${d.year}';
}
