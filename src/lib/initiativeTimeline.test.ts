import { describe, expect, it } from "vitest";
import { coversMonth, groupByYear, monthOf, monthsBetween, timelineFor } from "./initiativeTimeline";

describe("monthOf", () => {
  it("reads the year and month from an ISO date", () => {
    expect(monthOf("2026-03-15")).toEqual({ year: 2026, month: 3 });
  });

  it("returns null for empty or malformed input", () => {
    expect(monthOf(null)).toBeNull();
    expect(monthOf("")).toBeNull();
    expect(monthOf("TBD")).toBeNull();
    expect(monthOf("2026-13-01")).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("spans a single calendar year inclusively", () => {
    const months = monthsBetween("2026-01-01", "2026-12-31");
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe("2026-01");
    expect(months[11].key).toBe("2026-12");
  });

  it("crosses a year boundary, as the real cards do (M7 2024 → M7 2025)", () => {
    const months = monthsBetween("2024-07-01", "2025-07-31");
    expect(months).toHaveLength(13);
    expect(months[0].key).toBe("2024-07");
    expect(months[5].key).toBe("2024-12");
    expect(months[6].key).toBe("2025-01");
  });

  it("returns nothing for a missing bound or an inverted range", () => {
    expect(monthsBetween(null, "2026-12-31")).toEqual([]);
    expect(monthsBetween("2026-12-31", "2026-01-01")).toEqual([]);
  });

  it("caps an absurd range instead of rendering thousands of columns", () => {
    expect(monthsBetween("2026-01-01", "2260-01-01")).toHaveLength(120);
  });
});

describe("groupByYear", () => {
  it("groups the strip under year headers in order", () => {
    const groups = groupByYear(monthsBetween("2024-11-01", "2025-02-28"));
    expect(groups.map((g) => g.year)).toEqual([2024, 2025]);
    expect(groups[0].months).toHaveLength(2);
    expect(groups[1].months).toHaveLength(2);
  });
});

describe("coversMonth", () => {
  const months = monthsBetween("2026-01-01", "2026-12-31");
  const march = months[2];
  const august = months[7];

  it("shades only the months the activity runs", () => {
    const activity = { startDate: "2026-02-01", endDate: "2026-04-30" };
    expect(coversMonth(activity, march)).toBe(true);
    expect(coversMonth(activity, august)).toBe(false);
  });

  it("treats a one-sided range as that single month", () => {
    expect(coversMonth({ startDate: "2026-03-10", endDate: null }, march)).toBe(true);
    expect(coversMonth({ startDate: "2026-03-10", endDate: null }, august)).toBe(false);
  });

  it("shades nothing when the activity has no dates at all", () => {
    expect(coversMonth({ startDate: null, endDate: null }, march)).toBe(false);
  });
});

describe("timelineFor", () => {
  it("uses the initiative's own period when it has one", () => {
    const months = timelineFor({ startDate: "2026-01-01", endDate: "2026-06-30" }, [
      { startDate: "2026-02-01", endDate: "2026-03-31" },
    ]);
    expect(months).toHaveLength(6);
  });

  it("falls back to the span its activities cover — the real cards leave dates as TBD", () => {
    const months = timelineFor({ startDate: null, endDate: null }, [
      { startDate: "2026-03-01", endDate: "2026-04-30" },
      { startDate: "2026-02-01", endDate: "2026-02-28" },
      { startDate: "2026-05-01", endDate: null },
    ]);
    expect(months.map((m) => m.key)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05"]);
  });

  it("draws no strip when neither the initiative nor its activities are scheduled", () => {
    expect(timelineFor({ startDate: null, endDate: null }, [{ startDate: null, endDate: null }])).toEqual([]);
  });
});
