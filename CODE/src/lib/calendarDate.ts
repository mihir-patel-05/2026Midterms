/** Format a DATE column without UTC-to-local conversion changing its day. */
export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return 'Invalid date';
  return new Date(year, month - 1, day).toLocaleDateString('en-US', options);
}
