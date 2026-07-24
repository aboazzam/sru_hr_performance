"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const inviteSchema = z
  .object({
    employeeNumber: z.string().trim().min(1),
    fullNameAr: z.string().trim().min(1),
    fullNameEn: z.string().trim().optional(),
    email: z.string().trim().toLowerCase().email(),
    orgUnitId: z.string().uuid(),
    jobTitleId: z.string().uuid().optional(),
    hireDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    // The remaining fields mirror the project owner's real "Employees Data"
    // sheet (2026-07-24) — plain optional strings/dates, no enum, matching
    // the same TEXT-column-no-CHECK precedent as the DB migration that
    // added them (20260724000002).
    qualification: z.string().trim().optional(),
    educationSpeciality: z.string().trim().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    mobile: z.string().trim().optional(),
    maritalStatus: z.string().trim().optional(),
    gender: z.string().trim().optional(),
    nationality: z.string().trim().optional(),
    employeeCategory: z.string().trim().optional(),
    insuranceCategory: z.string().trim().optional(),
    roleId: z.string().uuid(),
    scopeType: z.enum(["all", "org_unit"]),
    scopeOrgUnitIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => data.scopeType === "all" || (data.scopeOrgUnitIds?.length ?? 0) > 0,
    { message: "org units required for org_unit scope", path: ["scopeOrgUnitIds"] }
  );

export type InviteEmployeeState =
  | { status: "success"; email: string }
  | {
      status: "error";
      message:
        | "invalid_input"
        | "unauthenticated"
        | "forbidden"
        | "duplicate"
        | "invite_failed"
        | "role_assignment_failed"
        | "rate_limited"
        | "unknown";
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
    jobTitleId: formData.get("jobTitleId") || undefined,
    hireDate: formData.get("hireDate") || undefined,
    qualification: formData.get("qualification") || undefined,
    educationSpeciality: formData.get("educationSpeciality") || undefined,
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    mobile: formData.get("mobile") || undefined,
    maritalStatus: formData.get("maritalStatus") || undefined,
    gender: formData.get("gender") || undefined,
    nationality: formData.get("nationality") || undefined,
    employeeCategory: formData.get("employeeCategory") || undefined,
    insuranceCategory: formData.get("insuranceCategory") || undefined,
    roleId: formData.get("roleId"),
    scopeType: formData.get("scopeType"),
    scopeOrgUnitIds: formData.getAll("scopeOrgUnitIds"),
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

  const {
    employeeNumber,
    fullNameAr,
    fullNameEn,
    email,
    orgUnitId,
    jobTitleId,
    hireDate,
    qualification,
    educationSpeciality,
    dateOfBirth,
    mobile,
    maritalStatus,
    gender,
    nationality,
    employeeCategory,
    insuranceCategory,
    roleId,
    scopeType,
    scopeOrgUnitIds,
  } = parsed.data;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      employee_number: employeeNumber,
      full_name_ar: fullNameAr,
      full_name_en: fullNameEn ?? null,
      email,
      org_unit_id: orgUnitId,
      job_title_id: jobTitleId ?? null,
      hire_date: hireDate ?? null,
      qualification: qualification ?? null,
      education_speciality: educationSpeciality ?? null,
      date_of_birth: dateOfBirth ?? null,
      mobile: mobile ?? null,
      marital_status: maritalStatus ?? null,
      gender: gender ?? null,
      nationality: nationality ?? null,
      employee_category: employeeCategory ?? null,
      insurance_category: insuranceCategory ?? null,
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

  // Role assignment can't go directly into user_roles yet -- the invited employee has no
  // auth.users row until they accept the invite, and user_roles.user_id references it.
  // pending_role_assignments (keyed by profile_id) holds the intent instead;
  // link_profile_to_auth_user() promotes it into real user_roles rows the moment the
  // auth user links up (20260721000001). A role scoped to several org units is just
  // several pending rows, same as user_roles' own scope_type='org_unit' pattern.
  const pendingRows: {
    profile_id: string;
    role_id: string;
    scope_type: "all" | "org_unit";
    org_unit_id: string | null;
    assigned_by: string;
  }[] =
    scopeType === "all"
      ? [{ profile_id: profile.id, role_id: roleId, scope_type: "all", org_unit_id: null, assigned_by: actor.id }]
      : (scopeOrgUnitIds ?? []).map((unitId) => ({
          profile_id: profile.id,
          role_id: roleId,
          scope_type: "org_unit",
          org_unit_id: unitId,
          assigned_by: actor.id,
        }));

  const { error: roleError } = await supabase.from("pending_role_assignments").insert(pendingRows);

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: inviteError ? "employee_invite_failed" : "employee_invited",
    entity: "profiles",
    entity_id: profile.id,
    after_data: {
      employee_number: employeeNumber,
      email,
      org_unit_id: orgUnitId,
      role_id: roleId,
      scope_type: scopeType,
      scope_org_unit_ids: scopeType === "org_unit" ? scopeOrgUnitIds : null,
    },
  });

  if (roleError) {
    return { status: "error", message: "role_assignment_failed" };
  }

  if (inviteError) {
    return { status: "error", message: "invite_failed" };
  }

  return { status: "success", email };
}
