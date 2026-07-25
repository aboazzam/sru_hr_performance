"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, IdCard, ShieldCheck, User, AlertCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { updateEmployee, type EditEmployeeState } from "@/app/[locale]/(app)/employees/[id]/edit/actions";
import { UserRoleAssignRow } from "@/components/UserRoleAssignRow";

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number;
}

interface RoleOption {
  id: string;
  name_ar: string;
}

interface ProfileData {
  id: string;
  employee_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  email: string | null;
  username: string | null;
  auth_user_id: string | null;
  status: string;
  org_unit_id: string | null;
  job_title_id: string | null;
  hire_date: string | null;
  qualification: string | null;
  education_speciality: string | null;
  date_of_birth: string | null;
  mobile: string | null;
  marital_status: string | null;
  gender: string | null;
  nationality: string | null;
  employee_category: string | null;
  insurance_category: string | null;
}

type ErrorMessage = Extract<EditEmployeeState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * Restyled 2026-07-25 to match EmployeeInviteForm.tsx's sectioned layout
 * (sru-formsection/sru-formgrid) — was a flat, unsectioned form until now,
 * per direct request ("اريد نموذج تعديل بيانات موظف بنفس تنسيق نموذج اضافة
 * موظف"). Also gained a Role & Permissions section, reusing
 * `UserRoleAssignRow` verbatim (the same multi-role checkbox dropdown +
 * save button already used on /admin's Users tab) rather than duplicating
 * its logic — only rendered for callers holding userManagement>=approve,
 * same gate as the add-employee form's account section.
 */
export function EditEmployeeForm({
  profile,
  orgUnits,
  jobTitles,
  roles,
  canManageUsers,
  initialRoleIds,
}: {
  profile: ProfileData;
  orgUnits: OrgUnitOption[];
  jobTitles: JobTitleOption[];
  roles: RoleOption[];
  canManageUsers: boolean;
  initialRoleIds: string[];
}) {
  const t = useTranslations("EmployeeEditPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<EditEmployeeState, FormData>(updateEmployee, null);

  useEffect(() => {
    if (state?.status === "success") {
      router.push(`/employees/${profile.id}`);
      router.refresh();
    }
  }, [state, router, profile.id]);

  return (
    <form action={formAction}>
      <input type="hidden" name="profileId" value={profile.id} />

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <User size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionBasicTitle")}</h3>
            <span>{t("sectionBasicSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("employeeNumberLabel")}</label>
            <input type="text" defaultValue={profile.employee_number} disabled />
          </div>
          <div className="sru-field">
            <label>{t("emailLabel")}</label>
            <input type="email" name="email" dir="ltr" style={{ textAlign: "left" }} defaultValue={profile.email ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("usernameLabel")}</label>
            <input type="text" name="username" dir="ltr" style={{ textAlign: "left" }} defaultValue={profile.username ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("fullNameArLabel")}</label>
            <input type="text" name="fullNameAr" required dir="rtl" defaultValue={profile.full_name_ar} />
          </div>
          <div className="sru-field">
            <label>{t("fullNameEnLabel")}</label>
            <input type="text" name="fullNameEn" dir="ltr" style={{ textAlign: "left" }} defaultValue={profile.full_name_en ?? ""} />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <IdCard size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionPersonalTitle")}</h3>
            <span>{t("sectionPersonalSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("dateOfBirthLabel")}</label>
            <input type="date" name="dateOfBirth" dir="ltr" defaultValue={profile.date_of_birth ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("nationalityLabel")}</label>
            <input type="text" name="nationality" defaultValue={profile.nationality ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("genderLabel")}</label>
            <select name="gender" defaultValue={profile.gender ?? ""}>
              <option value="">{t("genderPlaceholder")}</option>
              <option value="Male">{t("genderMale")}</option>
              <option value="Female">{t("genderFemale")}</option>
            </select>
          </div>
          <div className="sru-field">
            <label>{t("maritalStatusLabel")}</label>
            <select name="maritalStatus" defaultValue={profile.marital_status ?? ""}>
              <option value="">{t("maritalStatusPlaceholder")}</option>
              <option value="Single">{t("maritalStatusSingle")}</option>
              <option value="Married">{t("maritalStatusMarried")}</option>
              <option value="Divorced">{t("maritalStatusDivorced")}</option>
              <option value="Widowed">{t("maritalStatusWidowed")}</option>
            </select>
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Briefcase size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionJobTitle")}</h3>
            <span>{t("sectionJobSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("orgUnitLabel")}</label>
            <select name="orgUnitId" required defaultValue={profile.org_unit_id ?? ""}>
              <option value="" disabled>
                {t("orgUnitPlaceholder")}
              </option>
              {orgUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("jobTitleLabel")}</label>
            <select name="jobTitleId" defaultValue={profile.job_title_id ?? ""}>
              <option value="">{t("jobTitlePlaceholder")}</option>
              {jobTitles.map((title) => (
                <option key={title.id} value={title.id}>
                  {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("statusLabel")}</label>
            <select name="status" required defaultValue={profile.status}>
              <option value="active">{t("statusActive")}</option>
              <option value="on_leave">{t("statusOnLeave")}</option>
              <option value="terminated">{t("statusTerminated")}</option>
            </select>
          </div>
          <div className="sru-field">
            <label>{t("hireDateLabel")}</label>
            <input type="date" name="hireDate" dir="ltr" defaultValue={profile.hire_date ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("mobileLabel")}</label>
            <input type="text" name="mobile" dir="ltr" style={{ textAlign: "left" }} defaultValue={profile.mobile ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("qualificationLabel")}</label>
            <input type="text" name="qualification" defaultValue={profile.qualification ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("educationSpecialityLabel")}</label>
            <input type="text" name="educationSpeciality" defaultValue={profile.education_speciality ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("employeeCategoryLabel")}</label>
            <select name="employeeCategory" defaultValue={profile.employee_category ?? ""}>
              <option value="">{t("employeeCategoryPlaceholder")}</option>
              <option value="Academic">{t("employeeCategoryAcademic")}</option>
              <option value="Administrative">{t("employeeCategoryAdministrative")}</option>
            </select>
          </div>
          <div className="sru-field">
            <label>{t("insuranceCategoryLabel")}</label>
            <input type="text" name="insuranceCategory" dir="ltr" style={{ textAlign: "left" }} defaultValue={profile.insurance_category ?? ""} />
          </div>
        </div>
      </section>

      {canManageUsers && (
        <section className="sru-formsection">
          <div className="sru-formsection-head">
            <span className="sru-formsection-badge">
              <ShieldCheck size={17} aria-hidden />
            </span>
            <div>
              <h3>{t("sectionRoleTitle")}</h3>
              <span>{t("sectionRoleSubtitle")}</span>
            </div>
          </div>
          <div className="sru-formgrid">
            <div className="sru-field">
              <label>{t("roleLabel")}</label>
              <UserRoleAssignRow
                profileId={profile.id}
                authUserId={profile.auth_user_id}
                roles={roles}
                initialRoleIds={initialRoleIds}
              />
            </div>
          </div>
        </section>
      )}

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}
