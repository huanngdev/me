// Pure date helpers for the inline date. No React, no Plate, so the static renderer can import them.
// A stored date is a calendar date only: "YYYY-MM-DD", with no time and no zone. Every conversion
// below reads and writes plain Y-M-D numbers, so no Date is ever parsed from a string.

type StoredDateParts = { year: number; month: number; day: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Plain arithmetic, not Date.UTC: Date.UTC maps years 0-99 to 1900-1999.
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function parseStoredDate(value: unknown): StoredDateParts | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = ISO_DATE.exec(value);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

export function isStoredDate(value: unknown): value is string {
  return parseStoredDate(value) !== null;
}

// Returns the stored form for valid calendar parts, or null for anything else.
export function toStoredDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isStoredDate(text) ? text : null;
}

// The absolute label, e.g. "Oct 12, 2026". The date is built in UTC from its parts, so no
// timezone can shift it. setUTCFullYear keeps years 1-99 from being read as 1900-1999.
export function formatStoredDate(value: unknown): string {
  const parts = parseStoredDate(value);
  if (parts === null) {
    return "Invalid date";
  }

  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

// The user's local calendar day, as a stored date.
export function todayStoredDate(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// react-day-picker works in local calendar days: a picked day is the Date whose local Y/M/D
// is the day the user clicked. So a stored date becomes a local Date at noon (no DST edge at
// midnight), and a picked Date is read back with its local Y/M/D. The result is the same in any TZ.
export function storedDateToCalendarDate(value: unknown): Date | undefined {
  const parts = parseStoredDate(value);
  if (parts === null) {
    return undefined;
  }

  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  return date;
}

export function calendarDateToStoredDate(date: Date): string | null {
  return toStoredDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
