"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgStructureActionState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" };

const addLevelSchema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

function mapError(error: { code?: string; message: string }): OrgStructureActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  return { status: "error", message: "unknown" };
}

/**
 * Creates a new `org_structure_levels` row, appended at the end of the
 * existing sequence (level_order = current max + 1) — matches the project
 * owner's explicit "إدراج المستويات أولا بأول" (insert levels one after
 * another) workflow; there is no reordering/insert-in-the-middle UI.
 * Real authorization is `org_structure_levels_insert`'s RLS
 * (`check_vpra_global('orgStructure','approve')`, hr_admin-only per the
 * seeded matrix), enforced through the caller's own RLS-respecting client.
 */
export async function addLevel(nameAr: string, nameEn: string): Promise<OrgStructureActionState> {
  const parsed = addLevelSchema.safeParse({ nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: maxRow } = await supabase
    .from("org_structure_levels")
    .select("level_order")
    .is("deleted_at", null)
    .order("level_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.level_order ?? 0) + 1;

  const { data: level, error } = await supabase
    .from("org_structure_levels")
    .insert({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null, level_order: nextOrder })
    .select("id")
    .single();

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_level_added",
    entity: "org_structure_levels",
    entity_id: level.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null, level_order: nextOrder },
  });

  return { status: "success" };
}

const addPositionSchema = z.object({
  levelId: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

/**
 * Creates a new `org_structure_positions` row under an existing level.
 * Real authorization is `org_structure_positions_insert`'s RLS
 * (`check_vpra_global('orgStructure','approve')`), through the caller's own
 * RLS-respecting client. Also used by the staffing screen's own
 * "add position" form (same underlying action, per the project owner's
 * request that positions be addable/editable from there too).
 */
export async function addPosition(
  levelId: string,
  nameAr: string,
  nameEn: string
): Promise<OrgStructureActionState> {
  const parsed = addPositionSchema.safeParse({ levelId, nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: position, error } = await supabase
    .from("org_structure_positions")
    .insert({
      level_id: parsed.data.levelId,
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn ?? null,
    })
    .select("id")
    .single();

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_position_added",
    entity: "org_structure_positions",
    entity_id: position.id,
    after_data: { level_id: parsed.data.levelId, name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

const updatePositionSchema = z.object({
  positionId: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

/**
 * Edits an existing position's name — the "خاصية التعديل" (edit
 * capability) the project owner asked for on the staffing screen. Real
 * authorization is `org_structure_positions_update`'s RLS
 * (`check_vpra_global('orgStructure','approve')`).
 */
export async function updatePosition(
  positionId: string,
  nameAr: string,
  nameEn: string
): Promise<OrgStructureActionState> {
  const parsed = updatePositionSchema.safeParse({ positionId, nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { error } = await supabase
    .from("org_structure_positions")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .eq("id", parsed.data.positionId);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_position_updated",
    entity: "org_structure_positions",
    entity_id: parsed.data.positionId,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

const assignEmployeeSchema = z.object({
  positionId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

/**
 * "تسكين الأشخاص على الوظائف" — staffs a profile onto a position. Real
 * authorization is `org_structure_assignments_insert`'s RLS
 * (`check_vpra_global('orgStructure','approve')`). No headcount cap is
 * enforced (a position may have several active assignments); the
 * partial-unique index only blocks assigning the SAME employee to the SAME
 * position twice while active.
 */
export async function assignEmployee(positionId: string, employeeId: string): Promise<OrgStructureActionState> {
  const parsed = assignEmployeeSchema.safeParse({ positionId, employeeId });
  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: assignment, error } = await supabase
    .from("org_structure_assignments")
    .insert({ position_id: parsed.data.positionId, employee_id: parsed.data.employeeId })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "invalid_input" };
    }
    return mapError(error);
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_assignment_created",
    entity: "org_structure_assignments",
    entity_id: assignment.id,
    after_data: { position_id: parsed.data.positionId, employee_id: parsed.data.employeeId },
  });

  return { status: "success" };
}

/** Soft-unassigns (deleted_at) an existing assignment row. */
export async function unassignEmployee(assignmentId: string): Promise<OrgStructureActionState> {
  const parsed = z.string().uuid().safeParse(assignmentId);
  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { error } = await supabase
    .from("org_structure_assignments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_assignment_removed",
    entity: "org_structure_assignments",
    entity_id: parsed.data,
  });

  return { status: "success" };
}
