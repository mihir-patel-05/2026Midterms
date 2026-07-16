/** Parse a calendar date without allowing a timezone conversion to change its day. */
export function parseCalendarDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error('Date must use YYYY-MM-DD format');

  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid calendar date');
  return date;
}
