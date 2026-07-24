"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const editSchema = z.object({
  profileId: z.string().uuid(),
  fullNameAr: z.string().trim().min(1),
  fullNameEn: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email(),
  orgUnitId: z.string().uuid(),
  jobTitleId: z.string().uuid().optional(),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["active", "on_leave", "terminated"]),
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
});

export type EditEmployeeState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown" }
  | null;

/**
 * Updates a `profiles` row (2026-07-24, part of the View/Edit/Delete row
 * actions request). Deliberately scoped to `profiles`' own columns only —
 * role assignment is a distinct, already-existing concern
 * (invite/pending_role_assignments, assign-supervisor) not touched here.
 * The UPDATE goes through the caller's own RLS-respecting client — real
 * authorization is `profiles_update`'s own `check_vpra('employeeData',
 * 'prepare', org_unit_id)`, not this action's code; the UI only shows the
 * Edit button at the higher `'approve'` bar (see EmployeeDetailPage /
 * EmployeesPage), matching the project owner's explicit "for super_admin
 * and hr_admin" ask, without hardcoding those role names anywhere.
 */
export async function updateEmployee(_prevState: EditEmployeeState, formData: FormData): Promise<EditEmployeeState> {
  const parsed = editSchema.safeParse({
    profileId: formData.get("profileId"),
    fullNameAr: formData.get("fullNameAr"),
    fullNameEn: formData.get("fullNameEn") || undefined,
    email: formData.get("email"),
    orgUnitId: formData.get("orgUnitId"),
    jobTitleId: formData.get("jobTitleId") || undefined,
    hireDate: formData.get("hireDate") || undefined,
    status: formData.get("status"),
    qualification: formData.get("qualification") || undefined,
    educationSpeciality: formData.get("educationSpeciality") || undefined,
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    mobile: formData.get("mobile") || undefined,
    maritalStatus: formData.get("maritalStatus") || undefined,
    gender: formData.get("gender") || undefined,
    nationality: formData.get("nationality") || undefined,
    employeeCategory: formData.get("employeeCategory") || undefined,
    insuranceCategory: formData.get("insuranceCategory") || undefined,
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

  const { profileId, ...fields } = parsed.data;

  const { data: before } = await supabase.from("profiles").select("*").eq("id", profileId).maybeSingle();

  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        full_name_ar: fields.fullNameAr,
        full_name_en: fields.fullNameEn ?? null,
        email: fields.email,
        org_unit_id: fields.orgUnitId,
        job_title_id: fields.jobTitleId ?? null,
        hire_date: fields.hireDate ?? null,
        status: fields.status,
        qualification: fields.qualification ?? null,
        education_speciality: fields.educationSpeciality ?? null,
        date_of_birth: fields.dateOfBirth ?? null,
        mobile: fields.mobile ?? null,
        marital_status: fields.maritalStatus ?? null,
        gender: fields.gender ?? null,
        nationality: fields.nationality ?? null,
        employee_category: fields.employeeCategory ?? null,
        insurance_category: fields.insuranceCategory ?? null,
      },
      { count: "exact" }
    )
    .eq("id", profileId)
    .is("deleted_at", null);

  if (error) {
    if (error.code === "23505") return { status: "error", message: "duplicate" };
    return { status: "error", message: "unknown" };
  }
  if (!count) {
    return { status: "error", message: "forbidden" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "employee_updated",
    entity: "profiles",
    entity_id: profileId,
    before_data: before,
    after_data: fields,
  });

  return { status: "success" };
}
