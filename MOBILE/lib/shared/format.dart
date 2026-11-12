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
