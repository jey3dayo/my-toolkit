import {
  addDays,
  addHours as addHoursDateFns,
  format,
  isMatch,
  isValid,
  parse,
  parseISO,
} from "date-fns";

// Regex patterns at module level for performance (lint/performance/useTopLevelRegex)
const TZ_OFFSET_NO_COLON_REGEX = /([+-]\d{2})(\d{2})$/;
const TIME_HHMM_REGEX = /\d{1,2}:\d{2}/;
const YYYYMMDD_REGEX = /^\d{8}$/;

function normalizeDateTimeInput(value: string): string {
  return value
    .trim()
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xff_10 + 0x30)
    )
    .replace(/：/g, ":")
    .replace(/／/g, "/")
    .replace(/[－‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .replace(TZ_OFFSET_NO_COLON_REGEX, "$1:$2") // +0900 -> +09:00
    .replace(
      /(\d{1,2})時(\d{1,2})分?/g,
      (_m, h, m) => `${h}:${String(m).padStart(2, "0")}`
    )
    .replace(/(\d{1,2})時(?!\d)/g, "$1:00")
    .replace(/[分秒]/g, "")
    .replace(/\bJST\b/gi, "")
    .replace(/\b日本時間\b/g, "")
    .trim();
}

function parseWithFormats(
  value: string,
  formats: readonly string[]
): Date | null {
  for (const fmt of formats) {
    if (!isMatch(value, fmt)) {
      continue;
    }
    const parsed = parse(value, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function parseDateOnlyToYyyyMmDd(value: string): string | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const parsed = parseWithFormats(raw, [
    "yyyy-M-d",
    "yyyy-MM-dd",
    "yyyy/M/d",
    "yyyy/MM/dd",
    "yyyy年M月d日",
    "M/d",
    "MM/dd",
    "M-d",
    "MM-dd",
    "M月d日",
  ]);
  return parsed ? formatLocalYyyyMmDdFromDate(parsed) : null;
}

export function parseDateTimeLoose(value: string): Date | null {
  const normalized = normalizeDateTimeInput(value);
  if (!normalized) {
    return null;
  }

  if (!TIME_HHMM_REGEX.test(normalized)) {
    return null;
  }

  const isoCandidate = normalized.includes("T")
    ? normalized
    : normalized.replace(" ", "T");
  const parsedIso = parseISO(isoCandidate);
  if (isValid(parsedIso)) {
    return parsedIso;
  }

  return parseWithFormats(normalized, [
    "yyyy-M-d H:mm",
    "yyyy-M-d HH:mm",
    "yyyy-M-d H:mm:ss",
    "yyyy-M-d HH:mm:ss",
    "yyyy/M/d H:mm",
    "yyyy/M/d HH:mm",
    "yyyy/M/d H:mm:ss",
    "yyyy/M/d HH:mm:ss",
    "yyyy年M月d日 H:mm",
    "yyyy年M月d日 HH:mm",
    "yyyy年M月d日 H:mm:ss",
    "yyyy年M月d日 HH:mm:ss",
    "yyyy-MM-dd H:mm",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd H:mm:ss",
    "yyyy-MM-dd HH:mm:ss",
    "yyyy/MM/dd H:mm",
    "yyyy/MM/dd HH:mm",
    "yyyy/MM/dd H:mm:ss",
    "yyyy/MM/dd HH:mm:ss",
    "M/d H:mm",
    "M/d HH:mm",
    "M/d H:mm:ss",
    "M/d HH:mm:ss",
    "M-d H:mm",
    "M-d HH:mm",
    "M-d H:mm:ss",
    "M-d HH:mm:ss",
    "M月d日 H:mm",
    "M月d日 HH:mm",
    "M月d日 H:mm:ss",
    "M月d日 HH:mm:ss",
  ]);
}

export function formatUtcDateTimeFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

export function formatLocalYyyyMmDdFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return format(date, "yyyyMMdd");
}

function parseYyyyMmDdOrNull(value: string): Date | null {
  if (!YYYYMMDD_REGEX.test(value)) {
    return null;
  }
  const parsed = parse(value, "yyyyMMdd", new Date());
  return isValid(parsed) ? parsed : null;
}

export function nextDateYyyyMmDd(yyyymmdd: string): string {
  const raw = yyyymmdd.trim();
  const parsed = parseYyyyMmDdOrNull(raw);
  const next = parsed ? formatLocalYyyyMmDdFromDate(addDays(parsed, 1)) : null;
  return next ?? raw;
}

export function addHours(date: Date, hours: number): Date {
  return addHoursDateFns(date, hours);
}
