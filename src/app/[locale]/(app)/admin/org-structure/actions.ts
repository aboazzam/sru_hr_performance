"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgStructureErrorMessage = "invalid_input" | "unauthenticated" | "forbidden" | "has_dependents" | "unknown";

export type OrgStructureActionState =
  | { status: "success" }
  | { status: "error"; message: OrgStructureErrorMessage };

const addLevelSchema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

function mapErrorMessage(error: { code?: string; message: string }): OrgStructureErrorMessage {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "forbidden";
  }
  // validate_org_structure_position_parent() (20260723000001) RAISEs a plain
  // exception (no custom SQLSTATE) for every tree-invariant violation —
  // treat those as a validation error, not an opaque "unknown" failure.
  if (error.message.includes("org_structure_positions:")) {
    return "invalid_input";
  }
  return "unknown";
}

function mapError(error: { code?: string; message: string }): OrgStructureActionState {
  return { status: "error", message: mapErrorMessage(error) };
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

const updateLevelSchema = z.object({
  levelId: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

/** Edits an existing level's name. Real authorization is `org_structure_levels_update`'s RLS. */
export async function updateLevel(levelId: string, nameAr: string, nameEn: string): Promise<OrgStructureActionState> {
  const parsed = updateLevelSchema.safeParse({ levelId, nameAr, nameEn: nameEn || undefined });
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
    .from("org_structure_levels")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .eq("id", parsed.data.levelId);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_level_updated",
    entity: "org_structure_levels",
    entity_id: parsed.data.levelId,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

/**
 * Soft-deletes a level. Blocked (not just left to the DB) whenever it still
 * has active positions — deleting the level out from under them would
 * leave those positions pointing at a hidden level, an inconsistent state
 * this action refuses to create rather than relying on the RESTRICT FK
 * (which only guards a hard DELETE, not this soft-delete UPDATE).
 */
export async function deleteLevel(levelId: string): Promise<OrgStructureActionState> {
  const parsed = z.string().uuid().safeParse(levelId);
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

  const { count } = await supabase
    .from("org_structure_positions")
    .select("id", { count: "exact", head: true })
    .eq("level_id", parsed.data)
    .is("deleted_at", null);

  if (count && count > 0) {
    return { status: "error", message: "has_dependents" };
  }

  const { error } = await supabase
    .from("org_structure_levels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_level_deleted",
    entity: "org_structure_levels",
    entity_id: parsed.data,
  });

  return { status: "success" };
}

const addPositionSchema = z.object({
  levelId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

export type AddPositionResult =
  | { status: "success"; positionId: string }
  | { status: "error"; message: OrgStructureErrorMessage };

/**
 * Creates a new `org_structure_positions` row under an existing level, and
 * — per the project owner's 2026-07-23 clarification that this is a real
 * tree ("كل مستوى له عدة عقد وكل عقد له أب من المستوى السابق") — attached
 * to a parent position at the immediately preceding level. `parentId` is
 * omitted only for a position at the structure's first (root) level; the
 * real invariant is enforced by `validate_org_structure_position_parent()`
 * (20260723000001), not this action's Zod schema, which only requires a
 * syntactically valid UUID when present. Real authorization is
 * `org_structure_positions_insert`'s RLS
 * (`check_vpra_global('orgStructure','approve')`), through the caller's own
 * RLS-respecting client. Also used by the staffing screen's own
 * "add position" form, and by the first-time setup wizard (2026-07-24),
 * both per the project owner's requests — the returned `positionId` lets
 * the wizard offer this level's just-created positions as parent options
 * for the next level without a full page reload between steps.
 */
export async function addPosition(
  levelId: string,
  nameAr: string,
  nameEn: string,
  parentId?: string
): Promise<AddPositionResult> {
  const parsed = addPositionSchema.safeParse({
    levelId,
    parentId: parentId || undefined,
    nameAr,
    nameEn: nameEn || undefined,
  });
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
      parent_id: parsed.data.parentId ?? null,
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn ?? null,
    })
    .select("id")
    .single();

  if (error) return { status: "error", message: mapErrorMessage(error) };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_position_added",
    entity: "org_structure_positions",
    entity_id: position.id,
    after_data: {
      level_id: parsed.data.levelId,
      parent_id: parsed.data.parentId ?? null,
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn ?? null,
    },
  });

  return { status: "success", positionId: position.id };
}

const createLevelsBatchSchema = z.object({ count: z.number().int().min(1).max(20) });

export type CreateLevelsBatchResult =
  | { status: "success"; levels: { id: string; name_ar: string; level_order: number }[] }
  | { status: "error"; message: OrgStructureErrorMessage };

/**
 * First-time setup wizard only ("لا يوجد هيكل تنظيمي بإمكانك إنشاء هيكل
 * تنظيمي" — 2026-07-24): creates `count` sequential levels in one insert,
 * named "المستوى 1".."المستوى N" and appended after any existing levels
 * (mirrors `addLevel`'s own level_order-appending behavior, batched instead
 * of `count` separate round trips). Returns the created rows with real ids
 * so the wizard can move straight into per-level position creation without
 * a page reload. Real authorization is the same `org_structure_levels_insert`
 * RLS as `addLevel` (`check_vpra_global('orgStructure','approve')`).
 */
export async function createLevelsBatch(count: number): Promise<CreateLevelsBatchResult> {
  const parsed = createLevelsBatchSchema.safeParse({ count });
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
  const startOrder = (maxRow?.level_order ?? 0) + 1;

  const rows = Array.from({ length: parsed.data.count }, (_, i) => ({
    name_ar: `المستوى ${startOrder + i}`,
    level_order: startOrder + i,
  }));

  const { data: levels, error } = await supabase
    .from("org_structure_levels")
    .insert(rows)
    .select("id, name_ar, level_order");

  if (error) return { status: "error", message: mapErrorMessage(error) };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_levels_batch_created",
    entity: "org_structure_levels",
    after_data: { count: parsed.data.count, startOrder },
  });

  return {
    status: "success",
    levels: (levels ?? []).slice().sort((a, b) => a.level_order - b.level_order),
  };
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

/**
 * Soft-deletes a position. Blocked whenever it still has active employee
 * assignments (unassign first) or active child positions in the tree
 * (parent_id pointing at it) — deleting a middle node would either strand
 * assignments on a hidden position or break `validate_org_structure_position_parent()`'s
 * invariant for its children, so both are checked explicitly rather than
 * relying on the RESTRICT FKs (which only guard a hard DELETE, not this
 * soft-delete UPDATE).
 */
export async function deletePosition(positionId: string): Promise<OrgStructureActionState> {
  const parsed = z.string().uuid().safeParse(positionId);
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

  const { count: assignmentCount } = await supabase
    .from("org_structure_assignments")
    .select("id", { count: "exact", head: true })
    .eq("position_id", parsed.data)
    .is("deleted_at", null);

  const { count: childCount } = await supabase
    .from("org_structure_positions")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", parsed.data)
    .is("deleted_at", null);

  if ((assignmentCount && assignmentCount > 0) || (childCount && childCount > 0)) {
    return { status: "error", message: "has_dependents" };
  }

  const { error } = await supabase
    .from("org_structure_positions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "org_structure_position_deleted",
    entity: "org_structure_positions",
    entity_id: parsed.data,
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
