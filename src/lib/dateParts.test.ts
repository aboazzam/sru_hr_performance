import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  parseDateParts,
  formatDateValue,
  formatDateDmy,
  monthNames,
  monthNamesAr,
  monthNamesEn,
  yearOptions,
  datePartLabels,
  monthGrid,
  shiftMonth,
  firstWeekdayOfMonth,
} from "./dateParts";

describe("daysInMonth", () => {
  it("knows the ordinary month lengths", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("applies the real leap-year rule to February", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28); // divisible by 100, not by 400
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
  });
});

describe("parseDateParts", () => {
  it("splits a well-formed value", () => {
    expect(parseDateParts("2026-10-03")).toEqual({ year: 2026, month: 10, day: 3 });
  });

  it("returns null for empty, malformed, or impossible values", () => {
    expect(parseDateParts("")).toBeNull();
    expect(parseDateParts(null)).toBeNull();
    expect(parseDateParts("2026-10-3")).toBeNull();
    expect(parseDateParts("2026-13-01")).toBeNull();
    expect(parseDateParts("2026-02-29")).toBeNull(); // 2026 is not a leap year
    expect(parseDateParts("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe("formatDateValue", () => {
  it("builds a zero-padded ISO value", () => {
    expect(formatDateValue({ year: 2026, month: 10, day: 3 })).toBe("2026-10-03");
  });

  it("returns an empty string while any part is still unchosen", () => {
    expect(formatDateValue({ year: 2026, month: 10 })).toBe("");
    expect(formatDateValue({ year: 2026, day: 3 })).toBe("");
    expect(formatDateValue({})).toBe("");
  });

  it("clamps the day to the month's real length instead of producing an impossible date", () => {
    // Picking 31 and then switching to a 30-day month must not yield 31/09.
    expect(formatDateValue({ year: 2026, month: 9, day: 31 })).toBe("2026-09-30");
    expect(formatDateValue({ year: 2026, month: 2, day: 30 })).toBe("2026-02-28");
    expect(formatDateValue({ year: 2028, month: 2, day: 30 })).toBe("2028-02-29");
  });
});

describe("formatDateDmy", () => {
  it("renders `5 أغسطس 2026` — day, month name, year, no leading zero, no slashes", () => {
    expect(formatDateDmy("2026-08-05", "ar")).toBe("5 أغسطس 2026");
    expect(formatDateDmy("2026-08-05", "en")).toBe("5 August 2026");
    expect(formatDateDmy("2026-10-03", "ar")).toBe("3 أكتوبر 2026");
  });

  it("keeps two-digit days as they are", () => {
    expect(formatDateDmy("2026-11-15", "ar")).toBe("15 نوفمبر 2026");
  });

  it("shows a dash rather than a broken value when there is no date", () => {
    expect(formatDateDmy(null, "ar")).toBe("—");
    expect(formatDateDmy("", "en")).toBe("—");
  });
});

describe("month names", () => {
  it("has twelve names per locale", () => {
    expect(monthNamesAr).toHaveLength(12);
    expect(monthNamesEn).toHaveLength(12);
    expect(monthNames("ar")).toBe(monthNamesAr);
    expect(monthNames("en")).toBe(monthNamesEn);
  });
});

describe("yearOptions", () => {
  it("spans last year through ten years ahead", () => {
    const years = yearOptions(2026);
    expect(years[0]).toBe(2025);
    expect(years[years.length - 1]).toBe(2036);
    expect(years).toContain(2026);
  });
});

describe("datePartLabels", () => {
  it("names each part in Arabic by default, so an unset date is not three identical dashes", () => {
    expect(datePartLabels("ar")).toEqual({ day: "اليوم", month: "الشهر", year: "السنة" });
  });

  it("switches to English only for the en locale", () => {
    expect(datePartLabels("en")).toEqual({ day: "Day", month: "Month", year: "Year" });
    expect(datePartLabels("fr")).toEqual(datePartLabels("ar"));
  });
});

describe("monthGrid", () => {
  it("pads the lead-in and the tail so every row holds exactly seven cells", () => {
    const grid = monthGrid(2026, 8); // 1 August 2026 is a Saturday
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(grid.flat().filter((d) => d !== null)).toHaveLength(31);
  });

  it("follows the real leap-year rule for February", () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2026, 2).flat().filter(Boolean)).toHaveLength(28);
  });

  it("starts the week on Sunday", () => {
    // 1 November 2026 is a Sunday, so it sits in the first column.
    expect(monthGrid(2026, 11)[0][0]).toBe(1);
    expect(firstWeekdayOfMonth(2026, 11)).toBe(0);
  });
});

describe("shiftMonth", () => {
  it("rolls forward across a year boundary", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls backward across a year boundary", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("handles a whole year in one step, in both directions", () => {
    expect(shiftMonth(2026, 5, 12)).toEqual({ year: 2027, month: 5 });
    expect(shiftMonth(2026, 5, -12)).toEqual({ year: 2025, month: 5 });
  });
});
