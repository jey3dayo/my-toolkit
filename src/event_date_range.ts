import {
  addHours,
  formatLocalYyyyMmDdFromDate,
  formatUtcDateTimeFromDate,
  nextDateYyyyMmDd,
  parseDateOnlyToYyyyMmDd,
  parseDateTimeLoose,
} from './date_utils';

export type EventDateRange =
  | { kind: 'allDay'; startYyyyMmDd: string; endYyyyMmDdExclusive: string }
  | { kind: 'dateTime'; startUtc: string; endUtc: string };

export function computeEventDateRange(params: {
  start: string;
  end?: string;
  allDay?: boolean;
}): EventDateRange | null {
  const startRaw = params.start.trim();
  if (!startRaw) return null;
  const endRaw = params.end?.trim() ?? '';

  const startDateOnly = parseDateOnlyToYyyyMmDd(startRaw);
  const endDateOnly = endRaw ? parseDateOnlyToYyyyMmDd(endRaw) : null;

  if (params.allDay === true || startDateOnly) {
    const startDateFromTime = params.allDay === true && !startDateOnly ? parseDateTimeLoose(startRaw) : null;
    const startDate = startDateOnly || (startDateFromTime ? formatLocalYyyyMmDdFromDate(startDateFromTime) : null);
    if (!startDate) return null;

    const endDateFromTime = params.allDay === true && endRaw && !endDateOnly ? parseDateTimeLoose(endRaw) : null;
    let endDate =
      endDateOnly ||
      (endDateFromTime ? formatLocalYyyyMmDdFromDate(endDateFromTime) : null) ||
      nextDateYyyyMmDd(startDate);
    if (endDate.length !== 8) return null;
    if (endDate <= startDate) {
      endDate = nextDateYyyyMmDd(startDate);
    }

    return { kind: 'allDay', startYyyyMmDd: startDate, endYyyyMmDdExclusive: endDate };
  }

  const startDate = parseDateTimeLoose(startRaw);
  if (!startDate) return null;

  let endDate = endRaw ? parseDateTimeLoose(endRaw) : null;
  if (!endDate || endDate.getTime() <= startDate.getTime()) {
    endDate = addHours(startDate, 1);
  }

  const startUtc = formatUtcDateTimeFromDate(startDate);
  const endUtc = endDate ? formatUtcDateTimeFromDate(endDate) : null;
  if (!(startUtc && endUtc)) return null;

  return { kind: 'dateTime', startUtc, endUtc };
}
