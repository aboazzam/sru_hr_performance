import { describe, it, expect } from "vitest";
import { countVacancyStatuses, vacancyStatusLabel, vacancyStatuses, vacancyStatusLabels } from "./vacancyStatus";

describe("vacancyStatusLabel", () => {
  it("labels the known statuses in Arabic", () => {
    for (const status of vacancyStatuses) {
      expect(vacancyStatusLabels[status].length).toBeGreaterThan(0);
    }
    expect(vacancyStatusLabel("open")).toBe("مفتوح");
    expect(vacancyStatusLabel("filled")).toBe("تم شغله");
  });

  it("falls back to the raw value — status is free TEXT in the DB, not an enum", () => {
    expect(vacancyStatusLabel("on_hold")).toBe("on_hold");
  });
});

describe("countVacancyStatuses", () => {
  it("returns all zeros for an empty list", () => {
    expect(countVacancyStatuses([])).toEqual({ open: 0, closed: 0, filled: 0, other: 0, total: 0 });
  });

  it("counts each known status", () => {
    const counts = countVacancyStatuses(["open", "open", "closed", "filled"]);
    expect(counts).toEqual({ open: 2, closed: 1, filled: 1, other: 0, total: 4 });
  });

  it("puts an unknown status in `other` so the parts still add up to the total", () => {
    const counts = countVacancyStatuses(["open", "on_hold", "أخرى"]);
    expect(counts.other).toBe(2);
    expect(counts.open + counts.closed + counts.filled + counts.other).toBe(counts.total);
  });
});
