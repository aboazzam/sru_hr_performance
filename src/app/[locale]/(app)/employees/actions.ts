"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const deleteSchema = z.object({ profileId: z.string().uuid() });

export type DeleteEmployeeState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Soft-deletes a `profiles` row (2026-07-24, View/Edit/Delete row actions
 * request) — sets `deleted_at`, never a real DELETE, per CLAUDE.md §5-A
 * rule 7. Goes through the caller's own RLS-respecting client; real
 * authorization is `profiles_update`'s own `check_vpra('employeeData',
 * 'prepare', org_unit_id)` (a soft-delete is just an UPDATE), same as
 * `updateEmployee`. The UI only shows the Delete button at the higher
 * `'approve'` bar, matching the Edit button's own gate.
 */
export async function deleteEmployee(_prevState: DeleteEmployeeState, formData: FormData): Promise<DeleteEmployeeState> {
  const parsed = deleteSchema.safeParse({ profileId: formData.get("profileId") });
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

  const { profileId } = parsed.data;

  const { error, count } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", profileId)
    .is("deleted_at", null);

  if (error) {
    return { status: "error", message: "unknown" };
  }
  if (!count) {
    return { status: "error", message: "forbidden" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "employee_deleted",
    entity: "profiles",
    entity_id: profileId,
  });

  return { status: "success" };
}
