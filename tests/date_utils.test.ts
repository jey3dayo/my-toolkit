import { describe, expect, it } from "vitest";
import {
  formatLocalYyyyMmDdFromDate,
  formatUtcDateTimeFromDate,
  nextDateYyyyMmDd,
  parseDateOnlyToYyyyMmDd,
  parseDateTimeLoose,
} from "@/date_utils";

const YYYYMMDD_REGEX = /^\d{8}$/;

describe("src/date_utils.ts", () => {
  it("parses date-only inputs to YYYYMMDD", () => {
    expect(parseDateOnlyToYyyyMmDd("2025-1-2")).toBe("20250102");
    expect(parseDateOnlyToYyyyMmDd("2025/01/02")).toBe("20250102");
    expect(parseDateOnlyToYyyyMmDd("2025年1月2日")).toBe("20250102");
    expect(parseDateOnlyToYyyyMmDd("2025-02-30")).toBeNull();
    expect(parseDateOnlyToYyyyMmDd("12/16")).toMatch(YYYYMMDD_REGEX);
  });

  it("parses ISO-ish datetime with timezone offsets", () => {
    const parsed = parseDateTimeLoose("2025-12-16T10:00:00+09:00");
    expect(parsed).not.toBeNull();
    expect(parsed?.toISOString()).toBe("2025-12-16T01:00:00.000Z");
  });

  it("parses datetime inputs without year", () => {
    const parsed = parseDateTimeLoose("12/16 10:00");
    expect(parsed).not.toBeNull();
  });

  it("parses Japanese hour notation", () => {
    const parsed = parseDateTimeLoose("2025-12-16 10時");
    expect(parsed).not.toBeNull();
  });

  it("formats UTC datetime as YYYYMMDDTHHMMSSZ", () => {
    const date = new Date("2025-12-16T01:02:03.000Z");
    expect(formatUtcDateTimeFromDate(date)).toBe("20251216T010203Z");
  });

  it("formats local date as YYYYMMDD", () => {
    const date = new Date(2025, 0, 2, 12, 0, 0);
    expect(formatLocalYyyyMmDdFromDate(date)).toBe("20250102");
  });

  it("computes next date for YYYYMMDD", () => {
    expect(nextDateYyyyMmDd("20250131")).toBe("20250201");
  });
});
