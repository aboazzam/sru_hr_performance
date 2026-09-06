"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nominationIdentityKey, validateNominationCounts, type ThreeSixtyRaterGroup } from "@/lib/threeSixty";

const schema = z.object({
  cycleId: z.string().uuid(),
  // relationshipCode -> array of nominated rater profile ids, as JSON.
  selections: z.string(),
  // rater profile id -> months worked together (number) or null/omitted if
  // not entered, as JSON. Captured here (not on the resulting assignment
  // directly) because the NOMINATING employee is the one who knows this,
  // per this project's `months_worked_together` design decision.
  monthsByRaterId: z.string().optional(),
  // relationshipCode -> {name, email}[] of external (non-employee) raters,
  // as JSON -- see migration 20260906000002's header ("اسمح للخارجي
  // بالإجابة على الاستبيان من خلال الايميل الخاص به من غير دخول على
  // النظام"). Only accepted for groups the server itself confirms
  // `allows_external_rater` for -- the client hiding/showing this UI is a
  // convenience, never the real gate.
  externalByGroup: z.string().optional(),
});

const externalEntrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
});

export type SubmitNominationsState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "locked"; errors?: string[] }
  | null;

interface RaterIdentity {
  raterEmployeeId: string | null;
  externalRaterName: string | null;
  externalRaterEmail: string | null;
}

/**
 * Screen 2: replaces the employee's own nomination set for this cycle with
 * the submitted selection, validates it against the cycle's/rater-groups'
 * min/max bounds, and flips every surviving row to 'submitted' in one step
 * -- ready for the direct supervisor's approval (screen 2's second half,
 * `approveThreeSixtyNominations`). Blocked once any of this employee's
 * rows for the cycle has already reached 'submitted'/'approved' (must be
 * returned by the supervisor first) so a resubmission can't quietly
 * overwrite something already in review or already turned into real
 * assignments.
 *
 * 2026-09-06: a nominee is now either a real employee (`selections`) or an
 * external person with no profile at all (`externalByGroup`) -- the same
 * reconciliation (soft-delete removed, keep unchanged, insert new) now
 * spans both, keyed by `nominationIdentityKey` rather than a raw employee
 * id, since an external row's `rater_employee_id` is always NULL and a raw
 * `${code}::${raterEmployeeId}` template would collapse every external
 * nominee onto the same key.
 */
export async function submitThreeSixtyNominations(
  _prevState: SubmitNominationsState,
  formData: FormData
): Promise<SubmitNominationsState> {
  const parsed = schema.safeParse({
    cycleId: formData.get("cycleId"),
    selections: formData.get("selections"),
    monthsByRaterId: formData.get("monthsByRaterId") || undefined,
    externalByGroup: formData.get("externalByGroup") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  let selections: Record<string, string[]>;
  let monthsByRaterId: Record<string, number | null> = {};
  let externalByGroup: Record<string, { name: string; email: string }[]> = {};
  try {
    selections = JSON.parse(parsed.data.selections);
    if (parsed.data.monthsByRaterId) monthsByRaterId = JSON.parse(parsed.data.monthsByRaterId);
    if (parsed.data.externalByGroup) externalByGroup = JSON.parse(parsed.data.externalByGroup);
  } catch {
    return { status: "error", message: "invalid_input" };
  }
  // Validate every external entry strictly -- these are hand-typed, and a
  // malformed email must never silently vanish or silently write garbage.
  for (const entries of Object.values(externalByGroup)) {
    for (const entry of entries) {
      if (!externalEntrySchema.safeParse(entry).success) return { status: "error", message: "invalid_input" };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!myProfile) return { status: "error", message: "forbidden" };

  const { cycleId } = parsed.data;

  const [{ data: cycle }, { data: raterGroupRows }, { data: existingRows }] = await Promise.all([
    supabase.from("three_sixty_cycles").select("min_raters, max_raters").eq("id", cycleId).maybeSingle(),
    supabase
      .from("three_sixty_rater_groups")
      .select(
        "relationship_code, name_ar, min_raters_in_group, max_raters_in_group, employee_may_nominate, shown_separately, group_weight_pct, allows_external_rater"
      )
      .is("deleted_at", null),
    supabase
      .from("three_sixty_nominations")
      .select("id, relationship_code, rater_employee_id, external_rater_name, external_rater_email, status")
      .eq("cycle_id", cycleId)
      .eq("subject_employee_id", myProfile.id)
      .is("deleted_at", null),
  ]);

  if (!cycle) return { status: "error", message: "invalid_input" };

  if ((existingRows ?? []).some((r) => r.status === "submitted" || r.status === "approved")) {
    return { status: "error", message: "locked" };
  }

  const raterGroups: ThreeSixtyRaterGroup[] = (raterGroupRows ?? []).map((g) => ({
    relationshipCode: g.relationship_code,
    nameAr: g.name_ar,
    groupWeightPct: g.group_weight_pct,
    minRatersInGroup: g.min_raters_in_group,
    maxRatersInGroup: g.max_raters_in_group,
    shownSeparately: g.shown_separately,
    employeeMayNominate: g.employee_may_nominate,
  }));
  const nominateableCodes = new Set(raterGroups.filter((g) => g.employeeMayNominate).map((g) => g.relationshipCode));
  const externalAllowedCodes = new Set((raterGroupRows ?? []).filter((g) => g.allows_external_rater).map((g) => g.relationship_code));

  const byGroup: Record<string, number> = {};
  // relationshipCode -> identityKey -> full identity (needed to build an insert row for a brand-new key).
  const desired = new Map<string, Map<string, RaterIdentity>>();

  for (const [code, raterIds] of Object.entries(selections)) {
    if (!nominateableCodes.has(code)) continue; // ignore anything for a non-nominate-able group
    const unique = [...new Set(raterIds)].filter((id) => id !== myProfile.id);
    if (unique.length === 0) continue;
    const group = desired.get(code) ?? new Map<string, RaterIdentity>();
    for (const raterId of unique) {
      group.set(raterId, { raterEmployeeId: raterId, externalRaterName: null, externalRaterEmail: null });
    }
    desired.set(code, group);
  }

  for (const [code, entries] of Object.entries(externalByGroup)) {
    if (!nominateableCodes.has(code) || !externalAllowedCodes.has(code)) continue; // server-side gate, not just the client's UI
    if (entries.length === 0) continue;
    const group = desired.get(code) ?? new Map<string, RaterIdentity>();
    for (const entry of entries) {
      const identity: RaterIdentity = { raterEmployeeId: null, externalRaterName: entry.name, externalRaterEmail: entry.email };
      group.set(nominationIdentityKey(identity), identity);
    }
    desired.set(code, group);
  }

  for (const [code, group] of desired) byGroup[code] = group.size;

  const validation = validateNominationCounts({
    counts: { byGroup },
    cycle: { minRaters: cycle.min_raters, maxRaters: cycle.max_raters },
    raterGroups,
  });
  if (!validation.ok) {
    return { status: "error", message: "invalid_input", errors: validation.errors };
  }

  // Soft-delete rows no longer selected, keep rows still selected, insert new ones.
  const existingByKey = new Map(
    (existingRows ?? []).map((r) => [
      `${r.relationship_code}::${nominationIdentityKey({ raterEmployeeId: r.rater_employee_id, externalRaterEmail: r.external_rater_email })}`,
      r,
    ])
  );
  const desiredKeys = new Set<string>();
  for (const [code, group] of desired) {
    for (const key of group.keys()) desiredKeys.add(`${code}::${key}`);
  }

  const toRemoveIds = (existingRows ?? [])
    .filter(
      (r) =>
        !desiredKeys.has(
          `${r.relationship_code}::${nominationIdentityKey({ raterEmployeeId: r.rater_employee_id, externalRaterEmail: r.external_rater_email })}`
        )
    )
    .map((r) => r.id);

  const toInsert: {
    cycle_id: string;
    subject_employee_id: string;
    rater_employee_id: string | null;
    external_rater_name: string | null;
    external_rater_email: string | null;
    relationship_code: string;
    status: string;
    months_worked_together: number | null;
  }[] = [];
  for (const [code, group] of desired) {
    for (const [key, identity] of group) {
      const compositeKey = `${code}::${key}`;
      if (existingByKey.has(compositeKey)) continue;
      toInsert.push({
        cycle_id: cycleId,
        subject_employee_id: myProfile.id,
        rater_employee_id: identity.raterEmployeeId,
        external_rater_name: identity.externalRaterName,
        external_rater_email: identity.externalRaterEmail,
        relationship_code: code,
        status: "submitted",
        months_worked_together: identity.raterEmployeeId ? (monthsByRaterId[identity.raterEmployeeId] ?? null) : null,
      });
    }
  }
  const toKeep = (existingRows ?? []).filter((r) =>
    desiredKeys.has(
      `${r.relationship_code}::${nominationIdentityKey({ raterEmployeeId: r.rater_employee_id, externalRaterEmail: r.external_rater_email })}`
    )
  );

  if (toRemoveIds.length > 0) {
    const { error } = await supabase
      .from("three_sixty_nominations")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", toRemoveIds);
    if (error) return { status: "error", message: "forbidden" };
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("three_sixty_nominations").insert(toInsert);
    if (error) return { status: "error", message: "forbidden" };
  }
  for (const row of toKeep) {
    const { error } = await supabase
      .from("three_sixty_nominations")
      .update({
        status: "submitted",
        months_worked_together: row.rater_employee_id ? (monthsByRaterId[row.rater_employee_id] ?? null) : null,
      })
      .eq("id", row.id);
    if (error) return { status: "error", message: "forbidden" };
  }

  return { status: "success" };
}
