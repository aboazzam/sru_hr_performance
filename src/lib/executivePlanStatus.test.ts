import { describe, expect, it } from "vitest";
import { executivePlanStatusLabel } from "./executivePlanStatus";

describe("executivePlanStatusLabel", () => {
  it("translates the statuses the UI knows", () => {
    expect(executivePlanStatusLabel("draft")).toBe("مسودة");
    expect(executivePlanStatusLabel("active")).toBe("سارية");
    expect(executivePlanStatusLabel("closed")).toBe("مغلقة");
  });

  it("keeps an unrecognised value rather than blanking it", () => {
    expect(executivePlanStatusLabel("قيد المراجعة")).toBe("قيد المراجعة");
    expect(executivePlanStatusLabel("")).toBe("");
  });
});
