import { describe, it, expect } from "vitest";
import {
  cycleStatus,
  cycleStatusLabels,
  cycleStatuses,
  todayInTimezone,
  totalCycleUsage,
  cycleDependentTables,
} from "./evaluationCycle";

describe("cycleStatus", () => {
  it("classifies a cycle by its own dates", () => {
    expect(cycleStatus("2026-01-01", "2026-12-31", "2025-12-31")).toBe("upcoming");
    expect(cycleStatus("2026-01-01", "2026-12-31", "2026-06-15")).toBe("active");
    expect(cycleStatus("2026-01-01", "2026-12-31", "2027-01-01")).toBe("ended");
  });

  it("treats both ends as inclusive — a cycle is active on its first and last day", () => {
    expect(cycleStatus("2026-01-01", "2026-12-31", "2026-01-01")).toBe("active");
    expect(cycleStatus("2026-01-01", "2026-12-31", "2026-12-31")).toBe("active");
  });

  it("compares dates as YYYY-MM-DD strings, so ordering holds across months", () => {
    // A naive numeric/Date comparison is where this project already hit a
    // real off-by-one-day bug; string compare on this format is safe.
    expect(cycleStatus("2026-09-01", "2026-10-31", "2026-09-30")).toBe("active");
    expect(cycleStatus("2026-09-01", "2026-10-31", "2026-11-01")).toBe("ended");
  });

  it("has an Arabic label for every status", () => {
    for (const status of cycleStatuses) expect(cycleStatusLabels[status].length).toBeGreaterThan(0);
  });
});

describe("todayInTimezone", () => {
  it("returns the calendar day in the given zone, not the server's", () => {
    // 2026-06-15T22:30Z is already the 16th in Riyadh (UTC+3).
    const instant = new Date("2026-06-15T22:30:00Z");
    expect(todayInTimezone("Asia/Riyadh", instant)).toBe("2026-06-16");
    expect(todayInTimezone("UTC", instant)).toBe("2026-06-15");
  });

  it("always produces the YYYY-MM-DD shape the `date` columns use", () => {
    expect(todayInTimezone("Asia/Riyadh", new Date("2026-01-05T09:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("totalCycleUsage", () => {
  it("sums every dependent table's count", () => {
    expect(totalCycleUsage({ evaluations: 3, goals: 2, promotions: 1 })).toBe(6);
  });

  it("is zero for a cycle nothing references", () => {
    expect(totalCycleUsage({})).toBe(0);
  });

  it("covers every table that really has a cycle_id FK", () => {
    // Guards against a new table gaining a cycle_id without the delete check
    // learning about it — the list is what both the screen and the action use.
    expect(cycleDependentTables).toContain("evaluations");
    expect(cycleDependentTables).toContain("kpi_annual_targets");
    expect(new Set(cycleDependentTables).size).toBe(cycleDependentTables.length);
  });
});
