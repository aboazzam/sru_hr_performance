"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const inviteSchema = z
  .object({
    // "التسجيل بنظام الدعوة فقط، اسمح لمن لديه صلاحية المستخدمين انشاء حساب
    // موظف بدون دعوة" (2026-07-25) — 'invite' (default) sends a real email
    // via Supabase Auth exactly as before; 'direct' creates the auth.users
    // row immediately with a password the admin typed or generated, no
    // email at all, and forces a first-login password change (see
    // must_change_password below).
    mode: z.enum(["invite", "direct"]).default("invite"),
    password: z.string().trim().min(8).optional(),
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
    // "قد يكون له أكثر من دور مثل مدير الموارد البشرية ومدير الجدارات" —
    // an employee may hold several roles at once; user_roles/
    // pending_role_assignments already support multiple rows per user, this
    // was purely a single-select UI limitation.
    roleIds: z.array(z.string().uuid()).min(1),
    scopeType: z.enum(["all", "org_unit"]),
    scopeOrgUnitIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => data.scopeType === "all" || (data.scopeOrgUnitIds?.length ?? 0) > 0,
    { message: "org units required for org_unit scope", path: ["scopeOrgUnitIds"] }
  )
  .refine((data) => data.mode !== "direct" || !!data.password, {
    message: "password required for direct mode",
    path: ["password"],
  });

export type InviteEmployeeState =
  | { status: "success"; email: string; mode: "invite" | "direct" }
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
 * Creates a `profiles` row and either invites the employee via Supabase Auth
 * email (mode='invite', SRU_System_Design.md §C steps 2-3 — the profile is
 * created first, the invite fires second, and `link_profile_to_auth_user()`
 * (20260716000009) links the two automatically by email once the invite is
 * accepted) or creates the `auth.users` row directly with a password the
 * caller supplied, no email at all (mode='direct', 2026-07-25 —
 * "التسجيل بنظام الدعوة فقط، اسمح لمن لديه صلاحية المستخدمين انشاء حساب
 * موظف بدون دعوة"). `link_profile_to_auth_user()` fires on any `auth.users`
 * INSERT regardless of how it was created, so the direct path reuses the
 * exact same linking/role-promotion mechanism with zero changes there.
 *
 * The `profiles` INSERT goes through the caller's own RLS-respecting
 * client, not the admin client — `check_vpra('employeeData','prepare',
 * orgUnitId)` is enforced by Postgres itself (CLAUDE.md §5-A #4: server-side
 * VPRA check, not UI-only). The admin (service_role) client is used for the
 * things `authenticated` genuinely cannot do: the Admin Auth API call,
 * writing to `audit_log`, and (direct mode only) setting
 * `must_change_password` on a caller who may hold no employeeData grant.
 *
 * Both modes additionally require `userManagement`='approve', checked
 * explicitly here (not just relied on via RLS): `pending_role_assignments`'
 * own INSERT policy already requires it, but the Admin Auth API calls
 * (`inviteUserByEmail`/`createUser`) run through the service-role client and
 * bypass RLS entirely, so without this check a caller with `employeeData`
 * but no `userManagement` could still create a real login even though they
 * could never assign it a role.
 */
export async function inviteEmployee(
  _prevState: InviteEmployeeState,
  formData: FormData
): Promise<InviteEmployeeState> {
  const parsed = inviteSchema.safeParse({
    mode: formData.get("mode") || undefined,
    password: formData.get("password") || undefined,
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
    roleIds: formData.getAll("roleIds"),
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
    mode,
    password,
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
    roleIds,
    scopeType,
    scopeOrgUnitIds,
  } = parsed.data;

  // Explicit application-level check — see doc comment above for why RLS
  // alone (on pending_role_assignments) isn't enough here.
  const { data: canManageUsers } = await supabase.rpc("check_vpra", {
    p_process_area: "userManagement",
    p_min_level: "approve",
  });
  if (!canManageUsers) {
    return { status: "error", message: "forbidden" };
  }

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
  // auth user links up (20260721000001). A role held across several org units, or
  // several roles at once, is just several pending rows, same as user_roles' own
  // scope_type='org_unit' pattern.
  const pendingRows: {
    profile_id: string;
    role_id: string;
    scope_type: "all" | "org_unit";
    org_unit_id: string | null;
    assigned_by: string;
  }[] =
    scopeType === "all"
      ? roleIds.map((roleId) => ({
          profile_id: profile.id,
          role_id: roleId,
          scope_type: "all" as const,
          org_unit_id: null,
          assigned_by: actor.id,
        }))
      : roleIds.flatMap((roleId) =>
          (scopeOrgUnitIds ?? []).map((unitId) => ({
            profile_id: profile.id,
            role_id: roleId,
            scope_type: "org_unit" as const,
            org_unit_id: unitId,
            assigned_by: actor.id,
          }))
        );

  const { error: roleError } = await supabase.from("pending_role_assignments").insert(pendingRows);

  const { error: authError } =
    mode === "direct"
      ? await admin.auth.admin.createUser({ email, password, email_confirm: true })
      : await admin.auth.admin.inviteUserByEmail(email);

  if (!authError && mode === "direct") {
    // Best-effort: even if this update fails, the account and role
    // assignment already succeeded — surfacing an "unknown" error here
    // would be misleading when the real outcome is a working account that
    // simply isn't flagged for a forced password change.
    await admin.from("profiles").update({ must_change_password: true }).eq("id", profile.id);
  }

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: authError
      ? mode === "direct"
        ? "employee_account_creation_failed"
        : "employee_invite_failed"
      : mode === "direct"
        ? "employee_account_created_direct"
        : "employee_invited",
    entity: "profiles",
    entity_id: profile.id,
    after_data: {
      employee_number: employeeNumber,
      email,
      org_unit_id: orgUnitId,
      role_ids: roleIds,
      scope_type: scopeType,
      scope_org_unit_ids: scopeType === "org_unit" ? scopeOrgUnitIds : null,
      mode,
    },
  });

  if (roleError) {
    return { status: "error", message: "role_assignment_failed" };
  }

  if (authError) {
    return { status: "error", message: "invite_failed" };
  }

  return { status: "success", email, mode };
}
