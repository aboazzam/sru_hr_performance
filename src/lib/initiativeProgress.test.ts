import { describe, it, expect } from "vitest";
import { initiativeProgress } from "./initiativeProgress";

const today = "2026-08-20";

describe("initiativeProgress", () => {
  it("prefers a reported percentage over everything else", () => {
    expect(
      initiativeProgress(
        { progressPercent: 35, startDate: "2026-01-01", endDate: "2026-12-31", statusCode: "done" },
        today
      )
    ).toEqual({ percent: 35, kind: "reported" });
  });

  it("accepts the numeric string PostgREST returns for a NUMERIC column", () => {
    expect(initiativeProgress({ progressPercent: "42.50" }, today)).toEqual({ percent: 43, kind: "reported" });
  });

  it("clamps a reported value that is out of range", () => {
    expect(initiativeProgress({ progressPercent: 140 }, today).percent).toBe(100);
    expect(initiativeProgress({ progressPercent: -20 }, today).percent).toBe(0);
  });

  it("reads a done status as 100 when nothing was reported", () => {
    expect(initiativeProgress({ statusCode: "done" }, today)).toEqual({ percent: 100, kind: "status" });
  });

  it("falls back to elapsed time, and says so", () => {
    // 2026-01-01 .. 2026-12-31 is 364 days; 2026-08-20 is day 231.
    const p = initiativeProgress({ startDate: "2026-01-01", endDate: "2026-12-31" }, today);
    expect(p.kind).toBe("elapsed");
    expect(p.percent).toBe(63);
  });

  it("does not run past 100 or below 0 on a period that ended or has not started", () => {
    expect(initiativeProgress({ startDate: "2024-01-01", endDate: "2024-06-30" }, today).percent).toBe(100);
    expect(initiativeProgress({ startDate: "2027-01-01", endDate: "2027-06-30" }, today).percent).toBe(0);
  });

  it("handles a one-day period without dividing by zero", () => {
    expect(initiativeProgress({ startDate: today, endDate: today }, today)).toEqual({ percent: 100, kind: "elapsed" });
    expect(initiativeProgress({ startDate: "2027-01-01", endDate: "2027-01-01" }, today)).toEqual({
      percent: 0,
      kind: "elapsed",
    });
  });

  it("reports nothing rather than a confident zero when there is no data at all", () => {
    expect(initiativeProgress({}, today)).toEqual({ percent: 0, kind: "none" });
    expect(initiativeProgress({ startDate: "2026-01-01" }, today)).toEqual({ percent: 0, kind: "none" });
    expect(initiativeProgress({ statusCode: "pending" }, today)).toEqual({ percent: 0, kind: "none" });
  });
});
