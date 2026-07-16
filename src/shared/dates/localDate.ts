import { addDays, format, startOfWeek } from 'date-fns';

export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toLocalDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value || !LOCAL_DATE_PATTERN.test(value)) return null;

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function assertLocalDateRange(startDate: string, endDate: string): void {
  if (!parseLocalDate(startDate)) {
    throw new Error(`Invalid local start date: ${startDate}`);
  }

  if (!parseLocalDate(endDate)) {
    throw new Error(`Invalid local end date: ${endDate}`);
  }

  if (startDate > endDate) {
    throw new Error(`Local date range starts after it ends: ${startDate} > ${endDate}`);
  }
}

export function localDateRangesOverlap(
  firstStartDate: string,
  firstEndDate: string,
  secondStartDate: string,
  secondEndDate: string,
): boolean {
  assertLocalDateRange(firstStartDate, firstEndDate);
  assertLocalDateRange(secondStartDate, secondEndDate);

  return firstStartDate <= secondEndDate && secondStartDate <= firstEndDate;
}

export function todayLocalDate(): string {
  return toLocalDateString(new Date());
}

export function getMonday(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new Error(`Invalid local date: ${value}`);
  return toLocalDateString(startOfWeek(parsed, { weekStartsOn: 1 }));
}

export function getWeekDates(value: string): string[] {
  const monday = parseLocalDate(getMonday(value));
  if (!monday) throw new Error('Unable to resolve Monday.');
  return Array.from({ length: 7 }, (_, index) => toLocalDateString(addDays(monday, index)));
}

export function shiftDays(value: string, amount: number): string {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new Error(`Invalid local date: ${value}`);
  return toLocalDateString(addDays(parsed, amount));
}

export function formatLongDate(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) return value;
  return format(parsed, 'EEEE, MMMM d, yyyy');
}

export function formatShortDate(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) return value;
  return format(parsed, 'MMM d');
}
