"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ProgramActionState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown" }
  | null;

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v));

function mapError(error: { code?: string; message?: string } | null): ProgramActionState {
  if (!error) return { status: "success" };
  if (error.code === "42501" || error.message?.includes("row-level security")) return { status: "error", message: "forbidden" };
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

async function callerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profileId: null };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  return { supabase, user, profileId: (myProfile?.id as string | undefined) ?? null };
}

/**
 * Every write goes through the CALLER's own RLS-respecting client:
 * strategic_programs / _initiatives / _committee_members all gate writes at
 * check_vpra_global('strategicPlanning','approve') (20260819000002), so a
 * committee member — who can READ the program purely by being a member —
 * still cannot change it here. Soft-delete only (no DELETE policy exists),
 * and every UPDATE reads its affected rows back with .select() because an
 * RLS-blocked UPDATE affects zero rows WITHOUT erroring.
 */
const createProgramSchema = z
  .object({
    planId: z.string().uuid(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    descriptionAr: z.string().trim().optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    status: z.string().trim().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { path: ["endDate"] });

export async function createProgram(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const parsed = createProgramSchema.safeParse({
    planId: formData.get("planId"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    descriptionAr: formData.get("descriptionAr") || undefined,
    startDate: formData.get("startDate") ?? undefined,
    endDate: formData.get("endDate") ?? undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user, profileId } = await callerContext();
  if (!user) return { status: "error", message: "unauthenticated" };

  const d = parsed.data;
  const { data: created, error } = await supabase
    .from("strategic_programs")
    .insert({
      plan_id: d.planId,
      name_ar: d.nameAr,
      name_en: d.nameEn ?? null,
      description_ar: d.descriptionAr ?? null,
      start_date: d.startDate ?? null,
      end_date: d.endDate ?? null,
      ...(d.status ? { status: d.status } : {}),
      created_by: profileId,
    })
    .select("id")
    .maybeSingle();
  if (error) return mapError(error);

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_program_created",
      entity: "strategic_programs",
      entity_id: created?.id ?? null,
      after_data: { plan_id: d.planId, name_ar: d.nameAr },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/kpis/plans/[id]", "page");
  return { status: "success" };
}

const addInitiativeSchema = z.object({ programId: z.string().uuid(), initiativeId: z.string().uuid() });

export async function addProgramInitiative(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const parsed = addInitiativeSchema.safeParse({
    programId: formData.get("programId"),
    initiativeId: formData.get("initiativeId"),
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user, profileId } = await callerContext();
  if (!user) return { status: "error", message: "unauthenticated" };

  // Uniqueness is a PARTIAL index, which PostgREST's on_conflict inference
  // cannot target — the established select-then-insert workaround.
  const { data: existing } = await supabase
    .from("strategic_program_initiatives")
    .select("id")
    .eq("program_id", parsed.data.programId)
    .eq("initiative_id", parsed.data.initiativeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { status: "error", message: "duplicate" };

  const { error } = await supabase.from("strategic_program_initiatives").insert({
    program_id: parsed.data.programId,
    initiative_id: parsed.data.initiativeId,
    created_by: profileId,
  });
  if (error) return mapError(error);

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}

const removeRowSchema = z.object({ rowId: z.string().uuid() });

export async function removeProgramInitiative(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const parsed = removeRowSchema.safeParse({ rowId: formData.get("rowId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user } = await callerContext();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: updated, error } = await supabase
    .from("strategic_program_initiatives")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.rowId)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}

// Internal (a real profile) or external (a name, and optionally an
// affiliation/email) — never both, mirroring the table's own XOR CHECK.
const addMemberSchema = z
  .object({
    programId: z.string().uuid(),
    memberProfileId: z.string().uuid().optional(),
    externalName: z.string().trim().optional(),
    externalOrg: z.string().trim().optional(),
    externalEmail: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
    committeeRole: z.string().trim().optional(),
  })
  .refine((d) => Boolean(d.memberProfileId) !== Boolean(d.externalName), { path: ["memberProfileId"] });

export async function addCommitteeMember(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const parsed = addMemberSchema.safeParse({
    programId: formData.get("programId"),
    memberProfileId: formData.get("memberProfileId") || undefined,
    externalName: formData.get("externalName") || undefined,
    externalOrg: formData.get("externalOrg") || undefined,
    externalEmail: formData.get("externalEmail") || undefined,
    committeeRole: formData.get("committeeRole") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user, profileId } = await callerContext();
  if (!user) return { status: "error", message: "unauthenticated" };

  if (parsed.data.memberProfileId) {
    const { data: existing } = await supabase
      .from("strategic_program_committee_members")
      .select("id")
      .eq("program_id", parsed.data.programId)
      .eq("member_profile_id", parsed.data.memberProfileId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) return { status: "error", message: "duplicate" };
  }

  // New members join at the end of the roster; the order is then editable.
  const { data: lastRow } = await supabase
    .from("strategic_program_committee_members")
    .select("display_order")
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((lastRow?.display_order as number | undefined) ?? 0) + 1;

  const { error } = await supabase.from("strategic_program_committee_members").insert({
    program_id: parsed.data.programId,
    member_profile_id: parsed.data.memberProfileId ?? null,
    external_name: parsed.data.externalName ?? null,
    external_org: parsed.data.externalOrg ?? null,
    external_email: parsed.data.externalEmail ?? null,
    committee_role: parsed.data.committeeRole ?? null,
    display_order: nextOrder,
    created_by: profileId,
  });
  if (error) return mapError(error);

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_program_committee_member_added",
      entity: "strategic_programs",
      entity_id: parsed.data.programId,
      after_data: {
        member_profile_id: parsed.data.memberProfileId ?? null,
        external_name: parsed.data.externalName ?? null,
        committee_role: parsed.data.committeeRole ?? null,
      },
    });
  } catch {
    // ignored on purpose
  }

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}

export async function removeCommitteeMember(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const parsed = removeRowSchema.safeParse({ rowId: formData.get("rowId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user } = await callerContext();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: updated, error } = await supabase
    .from("strategic_program_committee_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.rowId)
    .is("deleted_at", null)
    .select("id, program_id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_program_committee_member_removed",
      entity: "strategic_programs",
      entity_id: updated[0].program_id,
      before_data: { committee_member_row: parsed.data.rowId },
    });
  } catch {
    // ignored on purpose
  }

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}

const reorderSchema = z.object({ programId: z.string().uuid(), memberIds: z.array(z.string().uuid()).min(1) });

/**
 * Reorders the whole committee in one statement via
 * reorder_program_committee (20260820000005), which refuses a partial or
 * foreign id list rather than silently reshuffling around rows the caller
 * never saw. SECURITY INVOKER, so RLS still decides who may reorder.
 */
export async function reorderCommitteeMembers(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const raw = formData.get("memberIds");
  let ids: unknown;
  try {
    ids = JSON.parse(typeof raw === "string" ? raw : "null");
  } catch {
    return { status: "error", message: "invalid_input" };
  }
  const parsed = reorderSchema.safeParse({ programId: formData.get("programId"), memberIds: ids });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user } = await callerContext();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase.rpc("reorder_program_committee", {
    p_program_id: parsed.data.programId,
    p_member_ids: parsed.data.memberIds,
  });
  if (error) return mapError(error);

  revalidatePath("/[locale]/kpis/plans/[id]/programs/[programId]", "page");
  return { status: "success" };
}
