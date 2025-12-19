import type { ExtractedEvent } from "@/shared_types";
import { formatUtcDateTimeFromDate } from "@/utils/date_utils";
import { computeEventDateRange } from "@/utils/event_date_range";

export function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || "event";
  return trimmed.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "event";
}

export function buildIcs(event: ExtractedEvent): string | null {
  const title = event.title?.trim() || "予定";
  const description = event.description?.trim() || "";
  const location = event.location?.trim() || "";

  const escapeIcsText = (value: string): string =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r/g, "");

  const foldLine = (line: string): string => {
    const max = 75;
    if (line.length <= max) {
      return line;
    }
    let out = "";
    for (let i = 0; i < line.length; i += max) {
      out += (i === 0 ? "" : "\r\n ") + line.slice(i, i + max);
    }
    return out;
  };

  const range = computeEventDateRange({
    start: event.start ?? "",
    end: event.end,
    allDay: event.allDay,
  });
  if (!range) {
    return null;
  }

  const dtStartLine =
    range.kind === "allDay"
      ? `DTSTART;VALUE=DATE:${range.startYyyyMmDd}`
      : `DTSTART:${range.startUtc}`;
  const dtEndLine =
    range.kind === "allDay"
      ? `DTEND;VALUE=DATE:${range.endYyyyMmDdExclusive}`
      : `DTEND:${range.endUtc}`;

  const uid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dtStamp = formatUtcDateTimeFromDate(new Date());
  if (!dtStamp) {
    return null;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//my-browser-utils//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeIcsText(title)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : "",
    description ? `DESCRIPTION:${escapeIcsText(description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
