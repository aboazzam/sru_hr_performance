/**
 * The organisational form of a unit (`org_units.kind`).
 *
 * Ordered from the governance tier downwards, so a picker reads like the
 * chart rather than like an alphabet.
 *
 * Replaced `org_units.type` on 2026-08-30. That column was never an
 * administrative classification: its own migration says it came from the
 * BOX COLOUR in the org-chart image, and that a real classification "deserves
 * its own column rather than overloading this one". This is that column, and
 * its values are read off the unit names themselves.
 *
 * Kept out of the Server Action file on purpose: a `"use server"` module may
 * only export async functions — a const exported from one becomes a server
 * reference rather than the array itself, and every use of it fails at
 * runtime with "orgUnitKinds.map is not a function". This project has hit
 * that before; the constant lives in a plain module instead.
 */
export const orgUnitKinds = [
  "council",
  "committee",
  "secretariat",
  "leadership",
  "college",
  "department",
  "office",
  "center",
  "unit",
] as const;

export type OrgUnitKind = (typeof orgUnitKinds)[number];
