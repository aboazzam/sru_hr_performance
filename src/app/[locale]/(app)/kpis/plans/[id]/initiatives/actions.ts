"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type InitiativeActionState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown" }
  | null;

// Every field except the description is required when adding an initiative
// (2026-08-20 request). The client marks them `required`, but that is only a
// convenience — a hidden input (which is how the two dates submit) is never
// validated by the browser at all, so this schema is the actual guard.
// The initiative page has its own edit action (initiatives/[id]) and is
// deliberately untouched: it patches one field at a time.
const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalid date" });

const createSchema = z
  .object({
    planId: z.string().uuid(),
    titleAr: z.string().trim().min(1),
    titleEn: z.string().trim().min(1),
    descriptionAr: z.string().trim().optional(),
    ownerOrgUnitId: z.string().uuid(),
    subGoalId: z.string().uuid(),
    startDate: requiredDate,
    endDate: requiredDate,
    statusCode: z.string().trim().min(1),
  })
  // Mirrors the DB's own strategic_initiatives_dates_valid CHECK so the
  // caller gets a real message instead of an opaque constraint violation.
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { path: ["endDate"] });

function mapError(error: { code?: string; message?: string } | null): InitiativeActionState {
  if (!error) return { status: "success" };
  if (error.code === "42501" || error.message?.includes("row-level security")) return { status: "error", message: "forbidden" };
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

/**
 * All three actions write through the CALLER's own RLS-respecting client:
 * real authorization is strategic_initiatives'/strategic_initiative_targets'
 * own policies (check_vpra_global('strategicPlanning','approve')), not code
 * here. An UPDATE blocked by RLS affects zero rows WITHOUT erroring — a trap
 * hit for real in the plan Excel import (2026-08-19) — so every update below
 * reads the affected rows back with .select() and treats an empty result as
 * "forbidden" rather than reporting a success that never happened.
 */
export async function createInitiative(_prev: InitiativeActionState, formData: FormData): Promise<InitiativeActionState> {
  const parsed = createSchema.safeParse({
    planId: formData.get("planId"),
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn"),
    descriptionAr: formData.get("descriptionAr") || undefined,
    ownerOrgUnitId: formData.get("ownerOrgUnitId"),
    subGoalId: formData.get("subGoalId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    statusCode: formData.get("statusCode"),
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const d = parsed.data;
  const { data: created, error } = await supabase
    .from("strategic_initiatives")
    .insert({
      plan_id: d.planId,
      title_ar: d.titleAr,
      title_en: d.titleEn,
      description_ar: d.descriptionAr ?? null,
      owner_org_unit_id: d.ownerOrgUnitId,
      sub_goal_id: d.subGoalId,
      start_date: d.startDate,
      end_date: d.endDate,
      status_code: d.statusCode,
      created_by: myProfile?.id ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return mapError(error);

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_initiative_created",
      entity: "strategic_initiatives",
      entity_id: created?.id ?? null,
      after_data: { plan_id: d.planId, title_ar: d.titleAr },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/kpis/plans/[id]", "page");
  return { status: "success" };
}

const linkSchema = z
  .object({
    initiativeId: z.string().uuid(),
    // "kpi:<uuid>" or "annual:<uuid>" — one control, two possible parents,
    // matching the table's own XOR.
    target: z.string().regex(/^(kpi|annual):[0-9a-f-]{36}$/),
  })
  .transform((d) => {
    const [kind, id] = d.target.split(":");
    return { initiativeId: d.initiativeId, kind: kind as "kpi" | "annual", targetId: id };
  });

export async function linkInitiativeTarget(_prev: InitiativeActionState, formData: FormData): Promise<InitiativeActionState> {
  const parsed = linkSchema.safeParse({ initiativeId: formData.get("initiativeId"), target: formData.get("target") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { initiativeId, kind, targetId } = parsed.data;
  const column = kind === "kpi" ? "kpi_id" : "kpi_annual_target_id";

  // Uniqueness here is a PARTIAL index, which PostgREST's on_conflict
  // inference cannot target — the same select-then-insert pattern already
  // used for evaluation_scores / calibration_results / org_structure_positions.
  const { data: existing } = await supabase
    .from("strategic_initiative_targets")
    .select("id")
    .eq("initiative_id", initiativeId)
    .eq(column, targetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { status: "error", message: "duplicate" };

  const { error } = await supabase
    .from("strategic_initiative_targets")
    .insert({ initiative_id: initiativeId, [column]: targetId, created_by: myProfile?.id ?? null });
  if (error) return mapError(error);

  revalidatePath("/[locale]/kpis/plans/[id]", "page");
  return { status: "success" };
}

const unlinkSchema = z.object({ linkId: z.string().uuid() });

export async function unlinkInitiativeTarget(_prev: InitiativeActionState, formData: FormData): Promise<InitiativeActionState> {
  const parsed = unlinkSchema.safeParse({ linkId: formData.get("linkId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  // Soft-delete: these tables have no DELETE policy at all (CLAUDE.md §5-A
  // rule 7). .select() is load-bearing — see the class comment above.
  const { data: updated, error } = await supabase
    .from("strategic_initiative_targets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.linkId)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  revalidatePath("/[locale]/kpis/plans/[id]", "page");
  return { status: "success" };
}

const deleteSchema = z.object({ initiativeId: z.string().uuid() });

export async function deleteInitiative(_prev: InitiativeActionState, formData: FormData): Promise<InitiativeActionState> {
  const parsed = deleteSchema.safeParse({ initiativeId: formData.get("initiativeId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("strategic_initiatives")
    .update({ deleted_at: now })
    .eq("id", parsed.data.initiativeId)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  // Its links go with it: leaving them active would keep the initiative
  // attached to targets it no longer belongs to (they are only ever read
  // through the initiative, but a future query joining the other way would
  // see orphans).
  await supabase
    .from("strategic_initiative_targets")
    .update({ deleted_at: now })
    .eq("initiative_id", parsed.data.initiativeId)
    .is("deleted_at", null);

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_initiative_deleted",
      entity: "strategic_initiatives",
      entity_id: parsed.data.initiativeId,
    });
  } catch {
    // ignored on purpose
  }

  revalidatePath("/[locale]/kpis/plans/[id]", "page");
  return { status: "success" };
}
