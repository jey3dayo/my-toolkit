import type { CalendarRegistrationTarget } from "@/shared_types";

export const DEFAULT_CALENDAR_TARGETS: CalendarRegistrationTarget[] = [
  "google",
  "ics",
];

const VALID_TARGETS = new Set<CalendarRegistrationTarget>(["google", "ics"]);

export function normalizeCalendarTargets(
  value: unknown
): CalendarRegistrationTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const targets: CalendarRegistrationTarget[] = [];
  for (const item of value) {
    if (!VALID_TARGETS.has(item as CalendarRegistrationTarget)) {
      continue;
    }
    if (!targets.includes(item as CalendarRegistrationTarget)) {
      targets.push(item as CalendarRegistrationTarget);
    }
  }
  return targets;
}

export function resolveCalendarTargets(
  value: unknown
): CalendarRegistrationTarget[] {
  if (typeof value === "undefined") {
    return DEFAULT_CALENDAR_TARGETS;
  }
  if (!Array.isArray(value)) {
    return DEFAULT_CALENDAR_TARGETS;
  }
  return normalizeCalendarTargets(value);
}
