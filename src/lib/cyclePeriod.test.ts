import { describe, expect, it } from "vitest";
import { addMonths, computeEndDate, describeCycleDuration, parseIsoDate } from "./cyclePeriod";

describe("parseIsoDate", () => {
  it("parses a valid date", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rejects a day that does not exist in that month", () => {
    // 2026 is not a leap year.
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2026-04-31")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("2026-1-1")).toBeNull();
    expect(parseIsoDate("not a date")).toBeNull();
  });
});

describe("addMonths", () => {
  it("adds whole months within a year", () => {
    expect(addMonths("2026-01-01", 3)).toBe("2026-04-01");
  });

  it("rolls over the year boundary", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("clamps the day to the target month's length", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("computeEndDate", () => {
  it("ends the day before the same date N months later", () => {
    expect(computeEndDate("2026-01-01", 12)).toBe("2026-12-31");
    expect(computeEndDate("2026-09-01", 9)).toBe("2027-05-31");
  });

  it("handles a start date mid-month", () => {
    expect(computeEndDate("2026-03-15", 6)).toBe("2026-09-14");
  });

  it("returns null for an unparsable start date", () => {
    expect(computeEndDate("", 12)).toBeNull();
  });
});

describe("describeCycleDuration", () => {
  it("reports inclusive days and whole months for a preset-shaped range", () => {
    expect(describeCycleDuration("2026-01-01", "2026-12-31")).toEqual({ days: 365, months: 12 });
  });

  it("counts the extra day in a leap year", () => {
    expect(describeCycleDuration("2024-01-01", "2024-12-31")).toEqual({ days: 366, months: 12 });
  });

  it("reports days only when the range is not a whole number of months", () => {
    expect(describeCycleDuration("2026-01-01", "2026-01-10")).toEqual({ days: 10, months: null });
  });

  it("recognises whole months across a year boundary", () => {
    expect(describeCycleDuration("2026-11-15", "2027-02-14")).toEqual({ days: 92, months: 3 });
  });

  it("returns null when the end is not after the start", () => {
    expect(describeCycleDuration("2026-05-01", "2026-05-01")).toBeNull();
    expect(describeCycleDuration("2026-05-02", "2026-05-01")).toBeNull();
  });

  it("returns null for unparsable dates", () => {
    expect(describeCycleDuration("2026-05-01", "")).toBeNull();
  });
});
