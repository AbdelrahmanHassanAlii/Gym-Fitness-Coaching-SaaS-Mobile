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
  if (!isApiDateOnly(value)) {
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
  if (!hasExplicitTimezoneOffset(timestamp)) {
    throw new Error('Timestamp must include Z or an explicit offset.');
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle,
    timeZone,
  }).format(new Date(timestamp));
}
