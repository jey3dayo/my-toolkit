import {
  addHours,
  formatLocalYyyyMmDdFromDate,
  formatUtcDateTimeFromDate,
  nextDateYyyyMmDd,
  parseDateOnlyToYyyyMmDd,
  parseDateTimeLoose,
} from "@/date_utils";

export type EventDateRange =
  | { kind: "allDay"; startYyyyMmDd: string; endYyyyMmDdExclusive: string }
  | { kind: "dateTime"; startUtc: string; endUtc: string };

function computeAllDayDateRange(params: {
  startRaw: string;
  endRaw: string;
  startDateOnly: string | null;
  endDateOnly: string | null;
  allDay: boolean;
}): EventDateRange | null {
  const startDateFromTime =
    params.allDay && !params.startDateOnly
      ? parseDateTimeLoose(params.startRaw)
      : null;
  const startDate =
    params.startDateOnly ||
    (startDateFromTime ? formatLocalYyyyMmDdFromDate(startDateFromTime) : null);
  if (!startDate) {
    return null;
  }

  const endDateFromTime =
    params.allDay && params.endRaw && !params.endDateOnly
      ? parseDateTimeLoose(params.endRaw)
      : null;
  let endDate =
    params.endDateOnly ||
    (endDateFromTime ? formatLocalYyyyMmDdFromDate(endDateFromTime) : null) ||
    nextDateYyyyMmDd(startDate);
  if (endDate.length !== 8) {
    return null;
  }
  if (endDate <= startDate) {
    endDate = nextDateYyyyMmDd(startDate);
  }

  return {
    kind: "allDay",
    startYyyyMmDd: startDate,
    endYyyyMmDdExclusive: endDate,
  };
}

function computeDateTimeRange(params: {
  startRaw: string;
  endRaw: string;
}): EventDateRange | null {
  const startDate = parseDateTimeLoose(params.startRaw);
  if (!startDate) {
    return null;
  }

  let endDate = params.endRaw ? parseDateTimeLoose(params.endRaw) : null;
  if (!endDate || endDate.getTime() <= startDate.getTime()) {
    endDate = addHours(startDate, 1);
  }

  const startUtc = formatUtcDateTimeFromDate(startDate);
  const endUtc = formatUtcDateTimeFromDate(endDate);
  if (!(startUtc && endUtc)) {
    return null;
  }

  return { kind: "dateTime", startUtc, endUtc };
}

export function computeEventDateRange(params: {
  start: string;
  end?: string;
  allDay?: boolean;
}): EventDateRange | null {
  const startRaw = params.start.trim();
  if (!startRaw) {
    return null;
  }
  const endRaw = params.end?.trim() ?? "";

  const startDateOnly = parseDateOnlyToYyyyMmDd(startRaw);
  const endDateOnly = endRaw ? parseDateOnlyToYyyyMmDd(endRaw) : null;

  const shouldTreatAsAllDay = params.allDay === true || Boolean(startDateOnly);
  if (shouldTreatAsAllDay) {
    return computeAllDayDateRange({
      startRaw,
      endRaw,
      startDateOnly,
      endDateOnly,
      allDay: params.allDay === true,
    });
  }

  return computeDateTimeRange({ startRaw, endRaw });
}
