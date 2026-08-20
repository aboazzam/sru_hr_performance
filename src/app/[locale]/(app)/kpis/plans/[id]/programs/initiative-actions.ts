"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ProgramInitiativeState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "duplicate_code" | "unknown" }
  | null;

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Full initiative form, matching the real initiative cards supplied by the
 * project owner: code, deliverable, definition, sub-goal, horizon, budget,
 * owning department, period and status. The strategic goal is NOT a field —
 * it is derived from the sub-goal, exactly as the cards present it.
 *
 * Every field except the definition (the free-prose description) is required,
 * matching the plan-level add-initiative form (2026-08-20 request). The form
 * marks them `required`, but that is only a convenience: the two dates travel
 * in hidden inputs, which a browser never validates, so this schema is the
 * actual guard.
 */
const createSchema = z
  .object({
    programId: z.string().uuid(),
    planId: z.string().uuid(),
    titleAr: z.string().trim().min(1),
    titleEn: z.string().trim().min(1),
    code: z.string().trim().min(1),
    deliverableAr: z.string().trim().min(1),
    descriptionAr: z.string().trim().optional(),
    subGoalId: z.string().uuid(),
    ownerOrgUnitId: z.string().uuid(),
    horizon: z.string().trim().min(1),
    budgetNote: z.string().trim().min(1),
    statusCode: z.string().trim().min(1),
    startDate: requiredDate,
    endDate: requiredDate,
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { path: ["endDate"] });

function mapError(error: { code?: string; message?: string } | null): ProgramInitiativeState {
  if (!error) return { status: "success" };
  if (error.code === "42501" || error.message?.includes("row-level security")) return { status: "error", message: "forbidden" };
  if (error.code === "23505") {
    return { status: "error", message: error.message?.includes("code") ? "duplicate_code" : "duplicate" };
  }
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

/**
 * Creates a brand-new initiative AND files it under the program in one go —
 * the flow the project owner asked for ("زر اضافة مبادرة وعند اضافة المبادرة
 * يظهر نموذج في جميع مكونات المبادرة").
 *
 * If the initiative is created but the link fails, the initiative is rolled
 * back by hand: leaving it behind would silently add an orphan to the plan's
 * initiatives tab that the user never asked for. PostgREST gives no
 * transaction across two statements, so this is the honest compensation.
 */
export async function createProgramInitiative(
  _prev: ProgramInitiativeState,
  formData: FormData
): Promise<ProgramInitiativeState> {
  const parsed = createSchema.safeParse({
    programId: formData.get("programId"),
    planId: formData.get("planId"),
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn"),
    code: formData.get("code"),
    deliverableAr: formData.get("deliverableAr"),
    descriptionAr: formData.get("descriptionAr") || undefined,
    subGoalId: formData.get("subGoalId"),
    ownerOrgUnitId: formData.get("ownerOrgUnitId"),
    horizon: formData.get("horizon"),
    budgetNote: formData.get("budgetNote"),
    statusCode: formData.get("statusCode"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  const myProfileId = (myProfile?.id as string | undefined) ?? null;

  const d = parsed.data;
  const { data: created, error } = await supabase
    .from("strategic_initiatives")
    .insert({
      plan_id: d.planId,
      title_ar: d.titleAr,
      title_en: d.titleEn,
      code: d.code,
      deliverable_ar: d.deliverableAr,
      description_ar: d.descriptionAr ?? null,
      sub_goal_id: d.subGoalId,
      owner_org_unit_id: d.ownerOrgUnitId,
      horizon: d.horizon,
      budget_note: d.budgetNote,
      status_code: d.statusCode,
      start_date: d.startDate,
      end_date: d.endDate,
      created_by: myProfileId,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return mapError(error);

  const { error: linkError } = await supabase
    .from("strategic_program_initiatives")
    .insert({ program_id: d.programId, initiative_id: created.id, created_by: myProfileId });
  if (linkError) {
    await supabase.from("strategic_initiatives").update({ deleted_at: new Date().toISOString() }).eq("id", created.id);
    return mapError(linkError);
  }

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "program_initiative_created",
      entity: "strategic_programs",
      entity_id: d.programId,
      after_data: { initiative_id: created.id, title_ar: d.titleAr, code: d.code ?? null },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}

const attachSchema = z.object({
  programId: z.string().uuid(),
  initiativeIds: z.array(z.string().uuid()).min(1),
});

/**
 * Files SEVERAL existing initiatives under one program at once — "ضع امكانية
 * اضافة عدة مبادرات ... ومن الممكن ان تكون المبادرات من اهداف مختلفة": no
 * filter by goal is applied, deliberately, because a program exists precisely
 * to pull related initiatives from different goals together.
 */
export async function attachProgramInitiatives(
  _prev: ProgramInitiativeState,
  formData: FormData
): Promise<ProgramInitiativeState> {
  const raw = formData.get("initiativeIds");
  let ids: unknown;
  try {
    ids = JSON.parse(typeof raw === "string" ? raw : "null");
  } catch {
    return { status: "error", message: "invalid_input" };
  }
  const parsed = attachSchema.safeParse({ programId: formData.get("programId"), initiativeIds: ids });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  // The link table's uniqueness is a PARTIAL index, which PostgREST's
  // on_conflict inference cannot target — so already-linked initiatives are
  // filtered out first rather than relying on an upsert.
  const { data: existing } = await supabase
    .from("strategic_program_initiatives")
    .select("initiative_id")
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null);
  const already = new Set((existing ?? []).map((r) => r.initiative_id as string));
  const fresh = parsed.data.initiativeIds.filter((id) => !already.has(id));
  if (fresh.length === 0) return { status: "error", message: "duplicate" };

  const { error } = await supabase.from("strategic_program_initiatives").insert(
    fresh.map((initiativeId) => ({
      program_id: parsed.data.programId,
      initiative_id: initiativeId,
      created_by: myProfile?.id ?? null,
    }))
  );
  if (error) return mapError(error);

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}
