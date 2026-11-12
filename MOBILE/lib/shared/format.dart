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
