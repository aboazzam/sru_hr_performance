/**
 * Which fields of an initiative card are still blank.
 *
 * Initiatives added from 2026-08-20 onward must carry every field except the
 * definition (the free-prose description) — both add-initiative forms enforce
 * that. Records created BEFORE that rule can be missing any of them, and the
 * edit screen deliberately still saves a partially-filled card so an old
 * record can be completed a field at a time rather than in one sitting. This
 * is what keeps the gap visible in the meantime.
 *
 * The definition is intentionally absent from the list: it is the one
 * optional field, so a card without it is complete, not incomplete.
 */
export const initiativeRequiredFields = [
  "code",
  "horizon",
  "titleAr",
  "titleEn",
  "deliverableAr",
  "subGoalId",
  "ownerOrgUnitId",
  "budgetNote",
  "statusCode",
  "startDate",
  "endDate",
] as const;

export type InitiativeFieldKey = (typeof initiativeRequiredFields)[number];

export type InitiativeCardValues = Record<InitiativeFieldKey, string | null | undefined>;

/** A value counts as present only when it holds a non-blank string. */
export function isFieldFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** The required fields still blank, in the card's own field order. */
export function missingInitiativeFields(values: Partial<InitiativeCardValues>): InitiativeFieldKey[] {
  return initiativeRequiredFields.filter((key) => !isFieldFilled(values[key]));
}
