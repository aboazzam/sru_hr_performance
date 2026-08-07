import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { NotificationContent } from "@/lib/notificationTemplates";
import type { RequiredAccess } from "@/lib/recruitmentWorkflow";

/**
 * Notification delivery. Server-only by construction (`server-only`), and it
 * writes through the SERVICE-ROLE client on purpose: `notifications` has no
 * INSERT policy for `authenticated` at all (20260807000006), so a user can
 * never fabricate a notification claiming, say, that their request was
 * approved. The only way a row appears is as a side effect of a Server
 * Action that already passed its own authorization.
 *
 * Resolving "the next party in the cycle" is done by PERMISSION, never by
 * role code — the same reason the workflow guard is written that way: the
 * finance and section-head roles are created by the project owner in /admin,
 * so their codes do not exist in any migration.
 */

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Every profile holding at least `minLevel` on `processArea`.
 *
 * Reads `role_permissions`/`user_roles` through the service-role client
 * because most callers cannot see those tables themselves (`userManagement`
 * gates them, which a section head or a finance reviewer has no reason to
 * hold). This is a lookup for addressing a message, not a permission check —
 * it grants nothing.
 */
export async function profilesWithAccess(
  admin: Admin,
  required: RequiredAccess[]
): Promise<string[]> {
  if (required.length === 0) return [];

  const areas = [...new Set(required.map((r) => r.processArea))];
  const { data: grants } = await admin
    .from("role_permissions")
    .select("role_id, process_area, vpra_level")
    .in("process_area", areas);

  const qualifyingRoleIds = (grants ?? [])
    .filter((grant) =>
      required.some(
        (need) =>
          need.processArea === (grant.process_area as ProcessArea) &&
          hasVpraAccess(grant.vpra_level as VpraLevel, need.minLevel)
      )
    )
    .map((grant) => grant.role_id);

  if (qualifyingRoleIds.length === 0) return [];

  const { data: assignments } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role_id", [...new Set(qualifyingRoleIds)]);

  const authUserIds = [...new Set((assignments ?? []).map((row) => row.user_id))];
  if (authUserIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .in("auth_user_id", authUserIds)
    .is("deleted_at", null);

  return (profiles ?? []).map((row) => row.id);
}

/**
 * Writes one notification per recipient. Deduplicates, drops nulls, and
 * never throws: a failed notification must not roll back or mask the real
 * action that triggered it — the same fire-and-forget discipline this
 * codebase already uses for non-critical audit writes (e.g. the login audit
 * row, which deliberately cannot block a legitimate sign-in).
 */
export async function notify(
  admin: Admin,
  recipientIds: Array<string | null | undefined>,
  content: NotificationContent,
  entityType: string,
  entityId: string | null
): Promise<number> {
  const unique = [...new Set(recipientIds.filter(Boolean) as string[])];
  if (unique.length === 0) return 0;

  try {
    const { error } = await admin.from("notifications").insert(
      unique.map((recipientId) => ({
        recipient_id: recipientId,
        entity_type: entityType,
        entity_id: entityId,
        type: content.type,
        message_ar: content.messageAr,
        link_path: content.linkPath,
      }))
    );
    if (error) {
      console.error("notify: insert failed", error.message);
      return 0;
    }
    return unique.length;
  } catch (error) {
    console.error("notify: unexpected failure", error);
    return 0;
  }
}
