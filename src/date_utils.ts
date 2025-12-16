import { addDays, format, isMatch, isValid, parse, parseISO } from 'date-fns';

function normalizeDateTimeInput(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2') // +0900 -> +09:00
    .replace(/\bJST\b/gi, '')
    .replace(/\b日本時間\b/g, '')
    .trim();
}

function parseWithFormats(value: string, formats: readonly string[]): Date | null {
  for (const fmt of formats) {
    if (!isMatch(value, fmt)) continue;
    const parsed = parse(value, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function parseDateOnlyToYyyyMmDd(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const parsed = parseWithFormats(raw, [
    'yyyy-M-d',
    'yyyy-MM-dd',
    'yyyy/M/d',
    'yyyy/MM/dd',
    'yyyy年M月d日',
  ]);
  if (!parsed) return null;

  return format(parsed, 'yyyyMMdd');
}

export function parseDateTimeLoose(value: string): Date | null {
  const normalized = normalizeDateTimeInput(value);
  if (!normalized) return null;

  if (!/\d{1,2}:\d{2}/.test(normalized)) {
    return null;
  }

  const isoCandidate = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const parsedIso = parseISO(isoCandidate);
  if (isValid(parsedIso)) return parsedIso;

  return parseWithFormats(normalized, [
    'yyyy-M-d H:mm',
    'yyyy-M-d HH:mm',
    'yyyy-M-d H:mm:ss',
    'yyyy-M-d HH:mm:ss',
    'yyyy/M/d H:mm',
    'yyyy/M/d HH:mm',
    'yyyy/M/d H:mm:ss',
    'yyyy/M/d HH:mm:ss',
    'yyyy年M月d日 H:mm',
    'yyyy年M月d日 HH:mm',
    'yyyy年M月d日 H:mm:ss',
    'yyyy年M月d日 HH:mm:ss',
    'yyyy-MM-dd H:mm',
    'yyyy-MM-dd HH:mm',
    'yyyy-MM-dd H:mm:ss',
    'yyyy-MM-dd HH:mm:ss',
    'yyyy/MM/dd H:mm',
    'yyyy/MM/dd HH:mm',
    'yyyy/MM/dd H:mm:ss',
    'yyyy/MM/dd HH:mm:ss',
  ]);
}

export function formatUtcDateTimeFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('');
}

export function formatLocalYyyyMmDdFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'yyyyMMdd');
}

export function nextDateYyyyMmDd(yyyymmdd: string): string {
  const raw = yyyymmdd.trim();
  if (!/^\d{8}$/.test(raw)) return raw;

  const parsed = parse(raw, 'yyyyMMdd', new Date());
  if (!isValid(parsed)) return raw;

  return format(addDays(parsed, 1), 'yyyyMMdd');
}
