"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const inviteSchema = z.object({
  employeeNumber: z.string().trim().min(1),
  fullNameAr: z.string().trim().min(1),
  fullNameEn: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email(),
  orgUnitId: z.string().uuid(),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type InviteEmployeeState =
  | { status: "success"; email: string }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "invite_failed" | "rate_limited" | "unknown";
    }
  | null;

/**
 * Creates a `profiles` row and invites the employee via Supabase Auth
 * (SRU_System_Design.md §C steps 2-3 — the profile is created first, the
 * invite fires second, and `link_profile_to_auth_user()`
 * (20260716000009) links the two automatically by email once the invite
 * is accepted).
 *
 * The `profiles` INSERT goes through the caller's own RLS-respecting
 * client, not the admin client — `check_vpra('employeeData','prepare',
 * orgUnitId)` is enforced by Postgres itself (CLAUDE.md §5-A #4: server-side
 * VPRA check, not UI-only). The admin (service_role) client is used only
 * for the two things `authenticated` genuinely cannot do: the Admin Auth
 * API call, and writing to `audit_log` (which has no INSERT policy for
 * `authenticated` by design — see 20260716000010).
 */
export async function inviteEmployee(
  _prevState: InviteEmployeeState,
  formData: FormData
): Promise<InviteEmployeeState> {
  const parsed = inviteSchema.safeParse({
    employeeNumber: formData.get("employeeNumber"),
    fullNameAr: formData.get("fullNameAr"),
    fullNameEn: formData.get("fullNameEn") || undefined,
    email: formData.get("email"),
    orgUnitId: formData.get("orgUnitId"),
    hireDate: formData.get("hireDate") || undefined,
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

  // 20/hour per actor — generous for legitimate bulk onboarding, but stops
  // a compromised/malicious hr_admin session from mass-inviting (CLAUDE.md
  // §5-A rate limiting; see src/lib/rate-limit.ts for the mechanism).
  const allowed = await checkRateLimit(`invite:actor:${actor.id}`, 20, 60 * 60);
  if (!allowed) {
    return { status: "error", message: "rate_limited" };
  }

  const { employeeNumber, fullNameAr, fullNameEn, email, orgUnitId, hireDate } = parsed.data;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      employee_number: employeeNumber,
      full_name_ar: fullNameAr,
      full_name_en: fullNameEn ?? null,
      email,
      org_unit_id: orgUnitId,
      hire_date: hireDate ?? null,
    })
    .select("id")
    .single();

  if (profileError) {
    if (profileError.code === "23505") {
      return { status: "error", message: "duplicate" };
    }
    if (profileError.code === "42501" || profileError.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  const admin = createAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: inviteError ? "employee_invite_failed" : "employee_invited",
    entity: "profiles",
    entity_id: profile.id,
    after_data: { employee_number: employeeNumber, email, org_unit_id: orgUnitId },
  });

  if (inviteError) {
    return { status: "error", message: "invite_failed" };
  }

  return { status: "success", email };
}
