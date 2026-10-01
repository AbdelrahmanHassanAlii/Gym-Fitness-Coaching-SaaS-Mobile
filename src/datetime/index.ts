import {
  hasExplicitTimezoneOffset,
  isApiDateOnly,
  type ApiDateOnly,
  type ApiTimestamp,
  type IanaTimezone,
} from '@/contracts';

export interface HalfOpenDateOnlyRange {
  from: ApiDateOnly;
  to: ApiDateOnly;
}

export interface FormatInstantOptions {
  locale: string;
  timeZone: IanaTimezone;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
}

export function parseDateOnly(value: string): ApiDateOnly {
  if (!isValidDateOnly(value)) {
    throw new Error('DateOnly must use YYYY-MM-DD.');
  }

  return value;
}

export function preserveDateOnly(value: ApiDateOnly): ApiDateOnly {
  return value;
}

export function createHalfOpenDateOnlyRange(
  from: ApiDateOnly,
  to: ApiDateOnly,
): HalfOpenDateOnlyRange {
  if (from >= to) {
    throw new Error('[from,to) DateOnly range requires from before to.');
  }

  return { from, to };
}

export function formatInstant(
  timestamp: ApiTimestamp,
  {
    locale,
    timeZone,
    dateStyle = 'medium',
    timeStyle = 'short',
  }: FormatInstantOptions,
): string {
  if (!isValidExplicitOffsetTimestamp(timestamp)) {
    throw new Error('Timestamp must include Z or an explicit offset.');
  }

  assertValidIanaTimezone(timeZone);

  return new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle,
    timeZone,
  }).format(new Date(timestamp));
}

export function isValidDateOnly(value: string): value is ApiDateOnly {
  if (!isApiDateOnly(value)) return false;

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function isValidExplicitOffsetTimestamp(value: string): value is ApiTimestamp {
  if (!hasExplicitTimezoneOffset(value)) return false;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  if (!isValidDateOnly(`${yearText}-${monthText}-${dayText}`)) return false;

  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return false;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() !== 'Invalid Date';
}

export function assertValidIanaTimezone(timeZone: IanaTimezone): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date(0));
  } catch {
    throw new Error('A valid IANA timezone is required.');
  }
}
