import { describe, expect, it } from "vitest";
import { classify, isInWindow, splitByWindow, targetCycleInScope } from "./executivePlanScope";

const window2026 = { startDate: "2026-01-01", endDate: "2026-12-31" };

describe("classify", () => {
  it("includes an item fully inside the window", () => {
    expect(classify({ startDate: "2026-03-01", endDate: "2026-06-30" }, window2026)).toBe("in-window");
  });

  it("includes an item that merely OVERLAPS the window on either side", () => {
    // The real cards routinely span a year and a half; requiring containment
    // would hide most of them.
    expect(classify({ startDate: "2025-07-01", endDate: "2026-02-28" }, window2026)).toBe("in-window");
    expect(classify({ startDate: "2026-11-01", endDate: "2027-06-30" }, window2026)).toBe("in-window");
    expect(classify({ startDate: "2025-01-01", endDate: "2027-12-31" }, window2026)).toBe("in-window");
  });

  it("includes an item touching only the first or last day", () => {
    expect(classify({ startDate: "2026-12-31", endDate: "2027-03-01" }, window2026)).toBe("in-window");
    expect(classify({ startDate: "2025-06-01", endDate: "2026-01-01" }, window2026)).toBe("in-window");
  });

  it("excludes an item entirely before or after the window", () => {
    expect(classify({ startDate: "2025-01-01", endDate: "2025-12-31" }, window2026)).toBe("outside-window");
    expect(classify({ startDate: "2027-01-01", endDate: "2027-12-31" }, window2026)).toBe("outside-window");
  });

  it("treats an open-ended item as still running", () => {
    expect(classify({ startDate: "2025-05-01", endDate: null }, window2026)).toBe("in-window");
    expect(classify({ startDate: "2027-05-01", endDate: null }, window2026)).toBe("outside-window");
  });

  it("treats an end-only item by that end date", () => {
    expect(classify({ startDate: null, endDate: "2026-04-30" }, window2026)).toBe("in-window");
    expect(classify({ startDate: null, endDate: "2025-04-30" }, window2026)).toBe("outside-window");
  });

  it("reports an item with no dates as undated rather than excluding it", () => {
    expect(classify({ startDate: null, endDate: null }, window2026)).toBe("undated");
    expect(isInWindow({ startDate: null, endDate: null }, window2026)).toBe(false);
  });
});

describe("splitByWindow", () => {
  it("separates the three groups the screen renders", () => {
    const items = [
      { id: "in", startDate: "2026-02-01", endDate: "2026-05-31" },
      { id: "overlap", startDate: "2026-10-01", endDate: "2027-04-30" },
      { id: "before", startDate: "2024-01-01", endDate: "2024-12-31" },
      { id: "tbd", startDate: null, endDate: null },
    ];
    const { inWindow, outside, undated } = splitByWindow(items, window2026);
    expect(inWindow.map((i) => i.id)).toEqual(["in", "overlap"]);
    expect(outside.map((i) => i.id)).toEqual(["before"]);
    expect(undated.map((i) => i.id)).toEqual(["tbd"]);
  });

  it("keeps every item in exactly one group", () => {
    const items = [
      { startDate: "2026-01-01", endDate: "2026-01-31" },
      { startDate: null, endDate: null },
      { startDate: "2030-01-01", endDate: "2030-12-31" },
    ];
    const { inWindow, outside, undated } = splitByWindow(items, window2026);
    expect(inWindow.length + outside.length + undated.length).toBe(items.length);
  });
});

describe("targetCycleInScope", () => {
  it("uses the plan's own cycle when one is linked, ignoring the dates", () => {
    const cycle = { id: "cycle-a", startDate: "2020-01-01", endDate: "2020-12-31" };
    expect(targetCycleInScope(cycle, window2026, "cycle-a")).toBe(true);
    expect(targetCycleInScope(cycle, window2026, "cycle-b")).toBe(false);
  });

  it("falls back to overlapping dates when the plan has no cycle", () => {
    expect(targetCycleInScope({ id: "c", startDate: "2026-06-01", endDate: "2027-05-31" }, window2026, null)).toBe(true);
    expect(targetCycleInScope({ id: "c", startDate: "2024-01-01", endDate: "2024-12-31" }, window2026, null)).toBe(false);
  });
});
