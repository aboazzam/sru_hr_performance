import { describe, it, expect } from "vitest";
import { cycleStatus, cycleStatusLabels, cycleStatuses, todayInTimezone, totalCycleUsage, cycleDependentTables, summariseCycleScoring } from "./evaluationCycle";

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

describe("summariseCycleScoring", () => {
  it("counts an evaluation as scored once, however many scores it has", () => {
    const s = summariseCycleScoring(
      [
        { id: "e1", cycle_id: "c1" },
        { id: "e2", cycle_id: "c1" },
      ],
      [
        { evaluation_id: "e1", score: 80 },
        { evaluation_id: "e1", score: 60 },
      ]
    );
    expect(s.get("c1")).toEqual({ total: 2, scored: 1, remaining: 1, averageScore: 70 });
  });

  it("averages over scores, not over evaluations", () => {
    // e1 carries three scores and e2 one: the cycle's average is the mean of
    // all four, not the mean of the two evaluations' own means.
    const s = summariseCycleScoring(
      [
        { id: "e1", cycle_id: "c1" },
        { id: "e2", cycle_id: "c1" },
      ],
      [
        { evaluation_id: "e1", score: 90 },
        { evaluation_id: "e1", score: 90 },
        { evaluation_id: "e1", score: 90 },
        { evaluation_id: "e2", score: 10 },
      ]
    );
    expect(s.get("c1")?.averageScore).toBe(70);
  });

  it("reports no average at all when nothing is scored, rather than zero", () => {
    const s = summariseCycleScoring([{ id: "e1", cycle_id: "c1" }], []);
    expect(s.get("c1")).toEqual({ total: 1, scored: 0, remaining: 1, averageScore: null });
  });

  it("keeps a null score out of the average but still marks the evaluation scored", () => {
    const s = summariseCycleScoring(
      [{ id: "e1", cycle_id: "c1" }],
      [{ evaluation_id: "e1", score: null }]
    );
    expect(s.get("c1")).toEqual({ total: 1, scored: 1, remaining: 0, averageScore: null });
  });

  it("ignores a score whose evaluation is not in view", () => {
    const s = summariseCycleScoring([{ id: "e1", cycle_id: "c1" }], [{ evaluation_id: "unknown", score: 100 }]);
    expect(s.get("c1")).toEqual({ total: 1, scored: 0, remaining: 1, averageScore: null });
  });

  it("keeps cycles apart", () => {
    const s = summariseCycleScoring(
      [
        { id: "e1", cycle_id: "c1" },
        { id: "e2", cycle_id: "c2" },
      ],
      [
        { evaluation_id: "e1", score: 100 },
        { evaluation_id: "e2", score: 50 },
      ]
    );
    expect(s.get("c1")?.averageScore).toBe(100);
    expect(s.get("c2")?.averageScore).toBe(50);
  });
});
