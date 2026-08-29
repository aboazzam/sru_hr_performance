/**
 * The `org_units.type` enum values.
 *
 * Kept out of the Server Action file on purpose: a `"use server"` module may
 * only export async functions — a const exported from one becomes a server
 * reference rather than the array itself, and every use of it fails at
 * runtime with "orgUnitTypes.map is not a function". This project has hit
 * that before; the constant lives in a plain module instead.
 */
export const orgUnitTypes = [
  "governance",
  "support",
  "academic",
  "administrative",
  "business_development",
] as const;

export type OrgUnitType = (typeof orgUnitTypes)[number];
