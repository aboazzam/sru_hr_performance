import { describe, it, expect } from "vitest";
import {
  initiativeRequiredFields,
  isFieldFilled,
  missingInitiativeFields,
} from "./initiativeCompleteness";

const complete = {
  code: "L.5.I.1",
  horizon: "H1",
  titleAr: "مبادرة",
  titleEn: "Initiative",
  deliverableAr: "مخرج",
  subGoalId: "3b100099-f79e-4de3-87ee-3759b03a9ec0",
  ownerOrgUnitId: "49884a6b-aa88-4ea8-a8ea-f0f2bcdf8e4f",
  budgetNote: "x",
  statusCode: "pending",
  startDate: "2026-09-01",
  endDate: "2027-02-28",
};

describe("missingInitiativeFields", () => {
  it("reports nothing for a fully filled card", () => {
    expect(missingInitiativeFields(complete)).toEqual([]);
  });

  it("does NOT ask for the definition — it is the one optional field", () => {
    expect(initiativeRequiredFields).not.toContain("descriptionAr");
    expect(missingInitiativeFields({ ...complete, descriptionAr: "" } as never)).toEqual([]);
  });

  it("lists every blank field of a card created before the rule existed", () => {
    expect(
      missingInitiativeFields({ titleAr: "مبادرة قديمة", statusCode: "pending" })
    ).toEqual(["code", "horizon", "titleEn", "deliverableAr", "subGoalId", "ownerOrgUnitId", "budgetNote", "startDate", "endDate"]);
  });

  it("treats null, undefined and whitespace alike as missing", () => {
    expect(missingInitiativeFields({ ...complete, code: null, horizon: undefined, budgetNote: "   " })).toEqual([
      "code",
      "horizon",
      "budgetNote",
    ]);
  });

  it("keeps the card's own field order, so the list reads top to bottom", () => {
    expect(missingInitiativeFields({ ...complete, endDate: "", code: "" })).toEqual(["code", "endDate"]);
  });

  it("isFieldFilled accepts a real value and rejects blanks", () => {
    expect(isFieldFilled("H1")).toBe(true);
    expect(isFieldFilled("")).toBe(false);
    expect(isFieldFilled("  ")).toBe(false);
    expect(isFieldFilled(null)).toBe(false);
    expect(isFieldFilled(undefined)).toBe(false);
  });
});
