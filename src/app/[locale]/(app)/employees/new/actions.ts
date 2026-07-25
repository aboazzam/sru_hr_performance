"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const usernameRegex = /^[a-zA-Z0-9_.]{3,32}$/;

const inviteSchema = z
  .object({
    // 'none' (default) — just an employee-data record, no login account at
    // all; reachable by anyone holding employeeData>=prepare (2026-07-25:
    // "الازرار ... نريدها تظهر لمن عنده صلاحية اعداد او ترشيح او اعتماد").
    // 'invite'/'direct' — an actual login account, gated separately behind
    // userManagement>=approve (see below) regardless of the employeeData
    // level that got the caller into this form at all.
    mode: z.enum(["none", "invite", "direct"]).default("none"),
    password: z.string().trim().min(8).optional(),
    employeeNumber: z.string().trim().min(1),
    fullNameAr: z.string().trim().min(1),
    fullNameEn: z.string().trim().optional(),
    // Both optional now (2026-07-25: "اجعل البريد الالكتروني اختياريا",
    // "اضف اسم المستخدم") — but at least one is required whenever an
    // account is actually being created (mode !== 'none'), checked below.
    email: z.string().trim().toLowerCase().email().optional(),
    username: z.string().trim().regex(usernameRegex).optional(),
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
    // Only meaningful when mode !== 'none' — an employee may hold several
    // roles at once; user_roles/pending_role_assignments already support
    // multiple rows per user, this was purely a single-select UI limitation.
    roleIds: z.array(z.string().uuid()).optional().default([]),
    scopeType: z.enum(["all", "org_unit"]).optional().default("all"),
    scopeOrgUnitIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => data.mode === "none" || data.roleIds.length > 0, {
    message: "at least one role required when creating an account",
    path: ["roleIds"],
  })
  .refine(
    (data) => data.scopeType === "all" || (data.scopeOrgUnitIds?.length ?? 0) > 0,
    { message: "org units required for org_unit scope", path: ["scopeOrgUnitIds"] }
  )
  .refine((data) => data.mode !== "direct" || !!data.password, {
    message: "password required for direct mode",
    path: ["password"],
  })
  .refine((data) => data.mode === "none" || !!data.email || !!data.username, {
    message: "email or username required to create an account",
    path: ["email"],
  });

export type InviteEmployeeState =
  | { status: "success"; email: string | null; mode: "none" | "invite" | "direct"; pendingApproval: boolean }
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
 * Creates a `profiles` row — reachable by anyone holding `employeeData` at
 * `prepare` or above (RLS-enforced, `profiles_insert`'s own
 * `check_vpra('employeeData','prepare', orgUnitId)`, unchanged). The
 * resulting record's `approval_status` is 'approved' immediately when the
 * caller already holds `employeeData`='approve' (scoped to the new
 * employee's own org unit) — otherwise it starts 'pending' and only shows
 * up in the main employees list once an approve-level holder reviews it
 * (2026-07-25: "لا يضاف للقائمة الا بعد الاعتماد ممن لديه الاعتماد").
 *
 * Creating an actual LOGIN account (mode='invite'|'direct') is a separate,
 * more privileged action layered on top — gated explicitly here at
 * `userManagement`='approve', the same bar `pending_role_assignments`'/
 * `user_roles`' own RLS already requires for role assignment, since the
 * Admin Auth API calls run through the service-role client and bypass RLS
 * entirely (CLAUDE.md §5-A #4: server-side check, not UI-only). A caller
 * below that bar can still submit employee DATA (mode stays 'none'); they
 * just never reach the account-creation branch below.
 *
 * `mode='direct'` (2026-07-25 — "التسجيل بنظام الدعوة فقط، اسمح لمن لديه
 * صلاحية المستخدمين انشاء حساب موظف بدون دعوة") creates the `auth.users`
 * row immediately with a password the admin typed or generated, no email
 * sent at all, forcing a first-login password change (`must_change_password`).
 * `link_profile_to_auth_user()` fires on any `auth.users` INSERT regardless
 * of how it was created, so this reuses the exact same linking/role-
 * promotion mechanism as `mode='invite'` with zero changes there.
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
    email: formData.get("email") || undefined,
    username: formData.get("username") || undefined,
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
    scopeType: formData.get("scopeType") || undefined,
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
  // a compromised/malicious session from mass-inviting (CLAUDE.md §5-A
  // rate limiting; see src/lib/rate-limit.ts for the mechanism).
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
    username,
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

  const creatingAccount = mode !== "none";

  // Explicit application-level check — see doc comment above for why RLS
  // alone (on pending_role_assignments) isn't enough here. Only checked
  // when an account is actually being requested; a data-only submission
  // doesn't need it at all.
  if (creatingAccount) {
    const { data: canManageUsers } = await supabase.rpc("check_vpra", {
      p_process_area: "userManagement",
      p_min_level: "approve",
    });
    if (!canManageUsers) {
      return { status: "error", message: "forbidden" };
    }
  }

  // A synthetic technical address only when an account genuinely needs one
  // and no real email was given — link_profile_to_auth_user() still matches
  // on profiles.email, so this keeps that mechanism working unchanged. A
  // data-only submission with no email is left exactly as entered (may be
  // null), since nothing ever calls the Auth API for it.
  const effectiveEmail = email ?? (creatingAccount ? `${username}@no-email.internal` : null);

  // Approval workflow (2026-07-25): approved immediately if the preparer
  // already holds employeeData='approve' for this org unit (no redundant
  // second approval of their own addition); otherwise starts 'pending' and
  // is invisible on the main employees list until reviewed.
  const { data: canApproveEmployeeData } = await supabase.rpc("check_vpra", {
    p_process_area: "employeeData",
    p_min_level: "approve",
    p_target_org_unit: orgUnitId,
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      employee_number: employeeNumber,
      full_name_ar: fullNameAr,
      full_name_en: fullNameEn ?? null,
      email: effectiveEmail,
      username: username ?? null,
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
      approval_status: canApproveEmployeeData ? "approved" : "pending",
      created_by: actor.id,
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

  if (!creatingAccount) {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: actor.id,
      action: canApproveEmployeeData ? "employee_data_added" : "employee_data_submitted_for_approval",
      entity: "profiles",
      entity_id: profile.id,
      after_data: { employee_number: employeeNumber, org_unit_id: orgUnitId },
    });
    return { status: "success", email: effectiveEmail, mode: "none", pendingApproval: !canApproveEmployeeData };
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
      ? await admin.auth.admin.createUser({ email: effectiveEmail!, password: password!, email_confirm: true })
      : await admin.auth.admin.inviteUserByEmail(effectiveEmail!);

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
      email: effectiveEmail,
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

  return { status: "success", email: effectiveEmail, mode, pendingApproval: !canApproveEmployeeData };
}
