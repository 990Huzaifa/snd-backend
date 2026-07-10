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
 * Parse a local wall-clock datetime string (no timezone required).
 * Accepts: 2026-07-10T09:00:00, 2026-07-10 09:00:00
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

/** Interpret parts as local time and return a Date (stored as UTC instant). */
export function localDateTimeToUtc(parts: LocalDateTimeParts): Date {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function localCalendarDate(parts: LocalDateTimeParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}
