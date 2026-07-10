import { BadRequestException } from '@nestjs/common';

export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Parse wall-clock parts from a datetime string.
 * Strips trailing Z / ±offset so components are treated as local numbers.
 */
export function parseLocalDateTimeParts(
  value: string,
  fieldName: string,
): LocalDateTimeParts {
  const normalized = value
    .trim()
    .replace(' ', 'T')
    .replace(/Z$/i, '')
    .replace(/([+-]\d{2}:?\d{2})$/, '');

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );
  if (!match) {
    throw new BadRequestException(
      `Invalid ${fieldName}: expected local datetime like 2026-07-10T09:00:00`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new BadRequestException(`Invalid ${fieldName}: out of range`);
  }

  return { year, month, day, hour, minute, second };
}

export function localCalendarDate(parts: LocalDateTimeParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

/**
 * Convert client local datetime → UTC Date for DB storage.
 *
 * timezoneOffsetMinutes must match Date#getTimezoneOffset() on the device
 * (e.g. Pakistan UTC+5 → -300).
 *
 * Formula: UTC = Date.UTC(localParts) + offsetMinutes * 60_000
 *
 * Example: local 2026-07-10T09:00:00 with offset -300 → 2026-07-10T04:00:00.000Z
 */
export function convertLocalDateTimeToUtc(
  value: string,
  fieldName: string,
  timezoneOffsetMinutes?: number,
): { utc: Date; attendanceDate: Date } {
  const trimmed = value.trim().replace(' ', 'T');

  // Already has timezone → absolute instant (no extra conversion)
  if (/Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const utc = new Date(trimmed);
    if (Number.isNaN(utc.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}: ${value}`);
    }
    const parts = parseLocalDateTimeParts(trimmed, fieldName);
    return { utc, attendanceDate: localCalendarDate(parts) };
  }

  const parts = parseLocalDateTimeParts(trimmed, fieldName);
  const offsetMinutes =
    timezoneOffsetMinutes ??
    new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ).getTimezoneOffset();

  // Treat parts as local wall clock, shift to UTC using offset
  const utc = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) +
      offsetMinutes * 60_000,
  );

  if (Number.isNaN(utc.getTime())) {
    throw new BadRequestException(`Invalid ${fieldName}: ${value}`);
  }

  return { utc, attendanceDate: localCalendarDate(parts) };
}
