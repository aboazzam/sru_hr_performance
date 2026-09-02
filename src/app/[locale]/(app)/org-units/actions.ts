"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgUnitActionState =
  | { status: "success" }
  | {
      status: "error";
      message:
        | "invalid_input"
        | "unauthenticated"
        | "forbidden"
        | "duplicate_code"
        | "duplicate_name"
        | "second_root"
        | "cycle"
        | "has_dependents"
        | "unknown";
    };

function mapError(error: { code?: string; message: string }): OrgUnitActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  // org_units carries three different unique constraints, and collapsing
  // them into one "duplicate" message sent the reader hunting for a
  // duplicate code when the real refusal was "there can only be one root
  // unit" (found live: the add form offered a rootless unit that the
  // org_units_single_root index always rejects).
  if (error.code === "23505") {
    if (error.message.includes("org_units_single_root")) return { status: "error", message: "second_root" };
    if (error.message.includes("unit_code")) return { status: "error", message: "duplicate_code" };
    return { status: "error", message: "duplicate_name" };
  }
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

/**
 * Every table that points at an org unit. A unit still referenced by any of
 * them cannot be removed — the FKs are declared on a hard DELETE, but this
 * removal is a soft delete (an UPDATE setting `deleted_at`), which sails
 * straight past them and would strand every row pointing here.
 */
const referencingTables: Array<{ table: string; column: string; softDeletes: boolean }> = [
  { table: "profiles", column: "org_unit_id", softDeletes: true },
  { table: "org_units", column: "parent_id", softDeletes: true },
  { table: "org_structure_positions", column: "org_unit_id", softDeletes: true },
  // These two have no deleted_at column at all, so asking for one would
  // error rather than filter — checked against the live schema, not assumed.
  { table: "user_roles", column: "org_unit_id", softDeletes: false },
  { table: "pending_role_assignments", column: "org_unit_id", softDeletes: false },
  { table: "vacancies", column: "org_unit_id", softDeletes: true },
  { table: "calibration_sessions", column: "org_unit_id", softDeletes: true },
  { table: "org_unit_evaluation_weights", column: "org_unit_id", softDeletes: true },
  { table: "strategic_initiatives", column: "owner_org_unit_id", softDeletes: true },
  { table: "initiative_assignments", column: "org_unit_id", softDeletes: true },
  { table: "operational_plan_target_org_units", column: "org_unit_id", softDeletes: true },
  { table: "recruitment_requests", column: "org_unit_id", softDeletes: true },
  { table: "recruitment_plan_items", column: "org_unit_id", softDeletes: true },
];

/**
 * Creates an org unit.
 *
 * Authorization is `org_units_insert`'s own RLS (`check_vpra('employeeData',
 * 'approve', parent_id)`), which has existed since 20260716000006 with no
 * consumer at all — until now the 58 units could only be seeded by a
 * migration. Nothing about who may write is changed here; what changes is
 * that the policy finally has a screen behind it.
 */
export async function createOrgUnit(input: {
  nameAr: string;
  nameEn?: string | null;
  unitCode?: string | null;
  kindId: string;
  typeId: string | null;
  levelId: string | null;
  parentId: string | null;
}): Promise<OrgUnitActionState> {
  const parsed = z
    .object({
      nameAr: z.string().trim().min(1),
      nameEn: z.string().trim().nullable().optional(),
      // NOT NULL in the database with no default, so an empty code is a
      // rejected input rather than a null write that fails opaquely.
      unitCode: z.string().trim().min(1),
      // The classifications are rows now, not a fixed list, so the only thing
      // validated here is that an id was given -- whether it names a real,
      // live row is settled by the foreign key, which cannot go stale the way
      // a copy of the value list in this file would.
      kindId: z.string().uuid(),
      typeId: z.string().uuid().nullable(),
      levelId: z.string().uuid().nullable(),
      parentId: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: inserted, error } = await supabase
    .from("org_units")
    .insert({
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn?.trim() || null,
      unit_code: parsed.data.unitCode,
      kind_id: parsed.data.kindId,
      type_id: parsed.data.typeId,
      level_id: parsed.data.levelId,
      parent_id: parsed.data.parentId,
    })
    .select("id");
  if (error) return mapError(error);
  if (!inserted || inserted.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_unit_created",
    entity: "org_units",
    entity_id: inserted[0].id,
    after_data: {
      name_ar: parsed.data.nameAr,
      kind_id: parsed.data.kindId,
      type_id: parsed.data.typeId,
      level_id: parsed.data.levelId,
      parent_id: parsed.data.parentId,
    },
  });

  return { status: "success" };
}

/**
 * Renames a unit and/or moves it under a different parent.
 *
 * The parent change is guarded here rather than by a constraint: proving that
 * a new parent is not the unit's own descendant needs a walk of the tree,
 * which a CHECK cannot express. Without it a subtree could be cut loose from
 * the root entirely — and `check_vpra`'s scope walk, which climbs this same
 * `parent_id` chain, would loop.
 */
export async function updateOrgUnit(input: {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  unitCode?: string | null;
  kindId: string;
  typeId: string | null;
  levelId: string | null;
  parentId: string | null;
}): Promise<OrgUnitActionState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      nameAr: z.string().trim().min(1),
      nameEn: z.string().trim().nullable().optional(),
      // NOT NULL in the database with no default, so an empty code is a
      // rejected input rather than a null write that fails opaquely.
      unitCode: z.string().trim().min(1),
      kindId: z.string().uuid(),
      typeId: z.string().uuid().nullable(),
      levelId: z.string().uuid().nullable(),
      parentId: z.string().uuid().nullable(),
    })
    .refine((data) => data.parentId !== data.id, { message: "a unit cannot be its own parent" })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  if (parsed.data.parentId) {
    const { data: allUnits } = await supabase
      .from("org_units")
      .select("id, parent_id")
      .is("deleted_at", null);
    const parentOf = new Map(
      ((allUnits ?? []) as Array<{ id: string; parent_id: string | null }>).map((u) => [u.id, u.parent_id])
    );
    // Walk up from the proposed parent: meeting this unit means the move
    // would put it under its own descendant. The depth cap is a guard against
    // an already-corrupted chain, not an expected case.
    let cursor: string | null = parsed.data.parentId;
    for (let depth = 0; cursor && depth < 100; depth += 1) {
      if (cursor === parsed.data.id) return { status: "error", message: "cycle" };
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const { data: before } = await supabase
    .from("org_units")
    .select("name_ar, name_en, unit_code, kind_id, type_id, level_id, parent_id")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();

  const after = {
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn?.trim() || null,
    unit_code: parsed.data.unitCode,
    kind_id: parsed.data.kindId,
    type_id: parsed.data.typeId,
    level_id: parsed.data.levelId,
    parent_id: parsed.data.parentId,
  };

  const { data: updated, error } = await supabase
    .from("org_units")
    .update(after)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_unit_updated",
    entity: "org_units",
    entity_id: parsed.data.id,
    before_data: before ?? null,
    after_data: after,
  });

  return { status: "success" };
}

/** Soft-deletes a unit, refused while anything still points at it. */
export async function deleteOrgUnit(id: string): Promise<OrgUnitActionState> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  for (const { table, column, softDeletes } of referencingTables) {
    let query = supabase.from(table).select(column, { head: true, count: "exact" }).eq(column, parsed.data);
    if (softDeletes) query = query.is("deleted_at", null);
    const { count, error } = await query;
    if (error) {
      // A table the caller cannot read must never be treated as "no
      // dependents" — refusing is the safe answer.
      return { status: "error", message: "has_dependents" };
    }
    if ((count ?? 0) > 0) return { status: "error", message: "has_dependents" };
  }

  const { data: updated, error } = await supabase
    .from("org_units")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .select("id, name_ar");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_unit_deleted",
    entity: "org_units",
    entity_id: parsed.data,
    before_data: { name_ar: updated[0].name_ar },
  });

  return { status: "success" };
}

const reorderOrgUnitsSchema = z.object({
  parentId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

/**
 * Reorders one sibling group -- every unit sharing `parentId` (or every
 * root, for `parentId: null`) -- to match `orderedIds`. 2026-09-02: "اضف
 * خاصية التحريك بحيث يمكن للمستخدم تغيير الترتيب"، ثم "كلاهما، ونفّذها في
 * صفحة الوحدات التنظيمية" once asked whether that meant reordering the
 * child units inside a card, the top-level cards themselves, or both --
 * both are the SAME operation here: a unit's `sort_order` is read wherever
 * it's displayed (this tree and the staffing screen's nested cards alike),
 * so reordering the real siblings under "رئيس الجامعة" in this tree is
 * exactly what controls the staffing screen's own top-level card order.
 *
 * `orderedIds` must be exactly the current, non-deleted members of that ONE
 * sibling group -- checked explicitly, the same discipline `reorderLevels`
 * already established, so a partial or foreign list can't silently corrupt
 * a group it wasn't even about. Unlike `org_structure_levels.level_order`,
 * `sort_order` carries no uniqueness constraint (a duplicate is harmless,
 * broken by name_ar), so this writes the final values directly in one pass
 * -- no negative-placeholder dance needed to dodge a collision that can't
 * happen.
 */
export async function reorderOrgUnits(parentId: string | null, orderedIds: string[]): Promise<OrgUnitActionState> {
  const parsed = reorderOrgUnitsSchema.safeParse({ parentId, orderedIds });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  let siblingQuery = supabase.from("org_units").select("id").is("deleted_at", null);
  siblingQuery = parsed.data.parentId ? siblingQuery.eq("parent_id", parsed.data.parentId) : siblingQuery.is("parent_id", null);
  const { data: siblings, error: fetchError } = await siblingQuery;
  if (fetchError) return mapError(fetchError);

  const siblingIds = new Set((siblings ?? []).map((row) => row.id as string));
  const requestedIds = parsed.data.orderedIds;
  if (siblingIds.size !== requestedIds.length || !requestedIds.every((id) => siblingIds.has(id))) {
    return { status: "error", message: "invalid_input" };
  }

  for (let i = 0; i < requestedIds.length; i++) {
    const { error } = await supabase.from("org_units").update({ sort_order: i }).eq("id", requestedIds[i]);
    if (error) return mapError(error);
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_units_reordered",
    entity: "org_units",
    after_data: { parent_id: parsed.data.parentId, order: requestedIds },
  });

  return { status: "success" };
}
