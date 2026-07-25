"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAreas, type ProcessArea, type VpraLevel } from "@/lib/vpra";

export type RoleActionMessage =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "duplicate"
  | "has_dependents"
  | "unknown";

export type RoleActionState = { status: "success" } | { status: "error"; message: RoleActionMessage };

function mapError(error: { code?: string; message: string }): RoleActionState {
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  return { status: "error", message: "unknown" };
}

// role_code mirrors CLAUDE.md §4-B rule 1: "unique role_code (slug, no
// spaces)" — lowercase snake_case, matching every seeded default role.
const roleCodeRegex = /^[a-z][a-z0-9_]*$/;

const roleInfoSchema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

/**
 * Only non-'none' levels are written, matching the already-established
 * sparse seeding convention in `role_permissions` (confirmed live: existing
 * roles hold anywhere from 3 to 13 of the 13 possible rows — a missing row
 * is treated as 'none' everywhere this table is read, both by
 * `check_vpra_global()`'s INNER JOIN and by this app's own `?? "none"`
 * fallback convention).
 */
function nonNoneRows(roleId: string, permissions: Partial<Record<ProcessArea, VpraLevel>>) {
  return processAreas
    .filter((area) => (permissions[area] ?? "none") !== "none")
    .map((area) => ({ role_id: roleId, process_area: area, vpra_level: permissions[area]! }));
}

/**
 * CLAUDE.md §4-B: super_admin/hr_admin can create custom roles from the UI.
 * New roles inherit `none` on every process area by default (rule 4) — the
 * caller only needs to pass the areas they want to grant. Real authorization
 * is `roles_insert`/`role_permissions_insert`'s RLS
 * (`check_vpra_global('userManagement','approve')`), through the caller's
 * own RLS-respecting client, not this action's code.
 */
export async function createRole(
  roleCode: string,
  nameAr: string,
  nameEn: string,
  permissions: Partial<Record<ProcessArea, VpraLevel>>
): Promise<RoleActionState> {
  const parsedInfo = roleInfoSchema.safeParse({ nameAr, nameEn: nameEn || undefined });
  if (!roleCodeRegex.test(roleCode.trim()) || !parsedInfo.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: role, error } = await supabase
    .from("roles")
    .insert({
      role_code: roleCode.trim(),
      name_ar: parsedInfo.data.nameAr,
      name_en: parsedInfo.data.nameEn ?? null,
      is_system_role: false,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error) return mapError(error);

  const rows = nonNoneRows(role.id, permissions);
  if (rows.length > 0) {
    const { error: permError } = await supabase.from("role_permissions").insert(rows);
    if (permError) return mapError(permError);
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "role_created",
    entity: "roles",
    entity_id: role.id,
    after_data: { role_code: roleCode.trim(), name_ar: parsedInfo.data.nameAr, name_en: parsedInfo.data.nameEn ?? null, permissions },
  });

  return { status: "success" };
}

const updateRoleSchema = z.object({
  roleId: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
});

/**
 * Edits a role's Arabic/English name and its full VPRA permission matrix in
 * one action. Diff-only-write, same discipline already established for
 * `saveEvaluationScores`/`saveCalibrationResults`/`ManageSupervisorsForm`:
 * only the process areas whose desired level actually changed get written,
 * as an insert/update (`upsert` — `role_permissions`' PK is the real,
 * non-partial `(role_id, process_area)`, so `onConflict` works directly,
 * unlike the partial-index tables elsewhere in this schema) or a delete
 * (when the new desired level is 'none', matching the sparse convention).
 * Real authorization is `roles_update`/`role_permissions_*`'s RLS.
 */
export async function updateRole(
  roleId: string,
  nameAr: string,
  nameEn: string,
  permissions: Partial<Record<ProcessArea, VpraLevel>>
): Promise<RoleActionState> {
  const parsed = updateRoleSchema.safeParse({ roleId, nameAr, nameEn: nameEn || undefined });
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

  const { error: infoError } = await supabase
    .from("roles")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .eq("id", parsed.data.roleId);
  if (infoError) return mapError(infoError);

  const { data: existingRows } = await supabase
    .from("role_permissions")
    .select("process_area, vpra_level")
    .eq("role_id", parsed.data.roleId);
  const existingByArea = new Map((existingRows ?? []).map((r) => [r.process_area as ProcessArea, r.vpra_level as VpraLevel]));

  const toUpsert: { role_id: string; process_area: ProcessArea; vpra_level: VpraLevel }[] = [];
  const toDeleteAreas: ProcessArea[] = [];
  for (const area of processAreas) {
    const desired = permissions[area] ?? "none";
    const current = existingByArea.get(area) ?? "none";
    if (desired === current) continue;
    if (desired === "none") {
      toDeleteAreas.push(area);
    } else {
      toUpsert.push({ role_id: parsed.data.roleId, process_area: area, vpra_level: desired });
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase.from("role_permissions").upsert(toUpsert, { onConflict: "role_id,process_area" });
    if (error) return mapError(error);
  }
  if (toDeleteAreas.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", parsed.data.roleId)
      .in("process_area", toDeleteAreas);
    if (error) return mapError(error);
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "role_updated",
    entity: "roles",
    entity_id: parsed.data.roleId,
    after_data: {
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn ?? null,
      changed_areas: [...toUpsert.map((u) => u.process_area), ...toDeleteAreas],
    },
  });

  return { status: "success" };
}

/**
 * Soft-deletes a role (`roles.deleted_at` — the table has no DELETE RLS
 * policy at all, matching CLAUDE.md §5-A rule 7's soft-delete convention).
 * Blocked for system roles (CLAUDE.md §4-B: "is_system_role = true means it
 * ships with the product and cannot be deleted") and whenever the role is
 * still assigned to anyone (real or pending) — deleting it out from under
 * an assigned user would silently strip their access.
 */
export async function deleteRole(roleId: string): Promise<RoleActionState> {
  const parsed = z.string().uuid().safeParse(roleId);
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

  const { data: role } = await supabase.from("roles").select("is_system_role").eq("id", parsed.data).maybeSingle();
  if (role?.is_system_role) {
    return { status: "error", message: "forbidden" };
  }

  const [{ count: userRoleCount }, { count: pendingCount }] = await Promise.all([
    supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role_id", parsed.data),
    supabase.from("pending_role_assignments").select("id", { count: "exact", head: true }).eq("role_id", parsed.data),
  ]);
  if ((userRoleCount && userRoleCount > 0) || (pendingCount && pendingCount > 0)) {
    return { status: "error", message: "has_dependents" };
  }

  const { error } = await supabase
    .from("roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "role_deleted",
    entity: "roles",
    entity_id: parsed.data,
  });

  return { status: "success" };
}

const assignUserRoleSchema = z.object({
  profileId: z.string().uuid(),
  authUserId: z.string().uuid().optional(),
  roleIds: z.array(z.string().uuid()),
});

/**
 * "قد يكون له أكثر من دور مثل مدير الموارد البشرية ومدير الجدارات مثلا فاسمح
 * بتسجيل اكثر من دور للموظف" (2026-07-25): assigns (or clears) the full set
 * of global (`scope_type='all'`) roles for one employee — was a single-role
 * select until now, a pure UI limitation (`user_roles`/
 * `pending_role_assignments` already allow several rows per user, one per
 * role). Deliberately touches only 'all'-scope assignments, leaving any
 * org-unit-scoped assignment (bulk-import only, today) untouched, since this
 * UI has no org-unit picker at all. Diff-free delete-then-bulk-insert
 * (not a diff, since the whole set is replaced every save — simpler than
 * `updateRole`'s per-area diffing and cheap enough at this row count).
 *
 * A linked account's assignment lives in `user_roles` (keyed by
 * `auth_user_id`); an invited-but-not-yet-accepted profile's lives in
 * `pending_role_assignments` (keyed by `profile_id`) until
 * `link_profile_to_auth_user()` promotes it — same split the Employees
 * list's own role column already reads from. Real authorization is each
 * table's RLS (`check_vpra_global('userManagement','approve')`).
 */
export async function assignUserRole(
  profileId: string,
  authUserId: string | null,
  roleIds: string[]
): Promise<RoleActionState> {
  const parsed = assignUserRoleSchema.safeParse({
    profileId,
    authUserId: authUserId ?? undefined,
    roleIds,
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

  if (parsed.data.authUserId) {
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", parsed.data.authUserId)
      .eq("scope_type", "all");
    if (delErr) return mapError(delErr);

    if (parsed.data.roleIds.length > 0) {
      const { error: insErr } = await supabase.from("user_roles").insert(
        parsed.data.roleIds.map((roleId) => ({
          user_id: parsed.data.authUserId,
          role_id: roleId,
          scope_type: "all" as const,
          assigned_by: actor.id,
        }))
      );
      if (insErr) return mapError(insErr);
    }
  } else {
    const { error: delErr } = await supabase
      .from("pending_role_assignments")
      .delete()
      .eq("profile_id", parsed.data.profileId)
      .eq("scope_type", "all");
    if (delErr) return mapError(delErr);

    if (parsed.data.roleIds.length > 0) {
      const { error: insErr } = await supabase.from("pending_role_assignments").insert(
        parsed.data.roleIds.map((roleId) => ({
          profile_id: parsed.data.profileId,
          role_id: roleId,
          scope_type: "all" as const,
          assigned_by: actor.id,
        }))
      );
      if (insErr) return mapError(insErr);
    }
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "user_role_assigned",
    entity: "user_roles",
    entity_id: parsed.data.profileId,
    after_data: { role_ids: parsed.data.roleIds },
  });

  return { status: "success" };
}
