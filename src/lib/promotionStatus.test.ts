import { describe, it, expect } from "vitest";
import {
  countPromotionStatuses,
  promotionStatusLabel,
  promotionStatuses,
  promotionStatusLabels,
  classifyPromotionAgainstCareerPath,
  nextCareerSteps,
} from "./promotionStatus";

describe("promotionStatusLabel", () => {
  it("labels every known status in Arabic", () => {
    for (const status of promotionStatuses) {
      expect(promotionStatusLabels[status].length).toBeGreaterThan(0);
    }
    expect(promotionStatusLabel("pending")).toBe("قيد المراجعة");
  });

  it("falls back to the raw value — status is free TEXT in the DB, not an enum", () => {
    expect(promotionStatusLabel("withdrawn")).toBe("withdrawn");
  });
});

describe("countPromotionStatuses", () => {
  it("counts each status and keeps the parts adding up to the total", () => {
    const counts = countPromotionStatuses(["pending", "approved", "approved", "on_hold"]);
    expect(counts).toEqual({ pending: 1, approved: 2, rejected: 0, other: 1, total: 4 });
    expect(counts.pending + counts.approved + counts.rejected + counts.other).toBe(counts.total);
  });
});

describe("classifyPromotionAgainstCareerPath", () => {
  const edges = [
    { fromJobTitleId: "a", toJobTitleId: "b" },
    { fromJobTitleId: "b", toJobTitleId: "c" },
    { fromJobTitleId: "a", toJobTitleId: "d" },
  ];

  it("recognizes a move the career ladder actually defines", () => {
    expect(classifyPromotionAgainstCareerPath("a", "b", edges)).toBe("on_path");
  });

  it("flags a move the ladder does not define", () => {
    expect(classifyPromotionAgainstCareerPath("a", "c", edges)).toBe("off_path");
  });

  it("does not judge a proposal with no from-title — that is unknown, not off-path", () => {
    // promotions.from_job_title_id is nullable: a real employee may have no
    // job title recorded yet, and calling that "off-path" would be wrong.
    expect(classifyPromotionAgainstCareerPath(null, "b", edges)).toBe("unknown");
  });

  it("treats an empty ladder as off-path, not as a crash", () => {
    expect(classifyPromotionAgainstCareerPath("a", "b", [])).toBe("off_path");
  });
});

describe("nextCareerSteps", () => {
  const edges = [
    { fromJobTitleId: "a", toJobTitleId: "b" },
    { fromJobTitleId: "a", toJobTitleId: "d" },
    { fromJobTitleId: "b", toJobTitleId: "c" },
  ];

  it("returns every defined next step, including a real fan-out", () => {
    expect(nextCareerSteps("a", edges).sort()).toEqual(["b", "d"]);
  });

  it("returns nothing for a title with no defined next step, or no title at all", () => {
    expect(nextCareerSteps("c", edges)).toEqual([]);
    expect(nextCareerSteps(null, edges)).toEqual([]);
  });
});
