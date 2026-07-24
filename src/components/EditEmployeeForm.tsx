"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateEmployee, type EditEmployeeState } from "@/app/[locale]/(app)/employees/[id]/edit/actions";

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number;
}

interface ProfileData {
  id: string;
  employee_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  email: string;
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

export function EditEmployeeForm({
  profile,
  orgUnits,
  jobTitles,
}: {
  profile: ProfileData;
  orgUnits: OrgUnitOption[];
  jobTitles: JobTitleOption[];
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

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      <input type="hidden" name="profileId" value={profile.id} />

      <div>
        <label className="block text-sm font-medium mb-1">{t("employeeNumberLabel")}</label>
        <input type="text" value={profile.employee_number} disabled className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("fullNameArLabel")}</label>
        <input type="text" name="fullNameAr" required dir="rtl" defaultValue={profile.full_name_ar} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("fullNameEnLabel")}</label>
        <input type="text" name="fullNameEn" dir="ltr" defaultValue={profile.full_name_en ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("emailLabel")}</label>
        <input type="email" name="email" required defaultValue={profile.email} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("orgUnitLabel")}</label>
        <select name="orgUnitId" required defaultValue={profile.org_unit_id ?? ""} className={inputClass}>
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

      <div>
        <label className="block text-sm font-medium mb-1">{t("jobTitleLabel")}</label>
        <select name="jobTitleId" defaultValue={profile.job_title_id ?? ""} className={inputClass}>
          <option value="">{t("jobTitlePlaceholder")}</option>
          {jobTitles.map((title) => (
            <option key={title.id} value={title.id}>
              {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("statusLabel")}</label>
        <select name="status" required defaultValue={profile.status} className={inputClass}>
          <option value="active">{t("statusActive")}</option>
          <option value="on_leave">{t("statusOnLeave")}</option>
          <option value="terminated">{t("statusTerminated")}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("hireDateLabel")}</label>
        <input type="date" name="hireDate" dir="ltr" defaultValue={profile.hire_date ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("dateOfBirthLabel")}</label>
        <input type="date" name="dateOfBirth" dir="ltr" defaultValue={profile.date_of_birth ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("qualificationLabel")}</label>
        <input type="text" name="qualification" defaultValue={profile.qualification ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("educationSpecialityLabel")}</label>
        <input
          type="text"
          name="educationSpeciality"
          defaultValue={profile.education_speciality ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("mobileLabel")}</label>
        <input type="text" name="mobile" dir="ltr" defaultValue={profile.mobile ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("genderLabel")}</label>
        <select name="gender" defaultValue={profile.gender ?? ""} className={inputClass}>
          <option value="">{t("genderPlaceholder")}</option>
          <option value="Male">{t("genderMale")}</option>
          <option value="Female">{t("genderFemale")}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("maritalStatusLabel")}</label>
        <select name="maritalStatus" defaultValue={profile.marital_status ?? ""} className={inputClass}>
          <option value="">{t("maritalStatusPlaceholder")}</option>
          <option value="Single">{t("maritalStatusSingle")}</option>
          <option value="Married">{t("maritalStatusMarried")}</option>
          <option value="Divorced">{t("maritalStatusDivorced")}</option>
          <option value="Widowed">{t("maritalStatusWidowed")}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("nationalityLabel")}</label>
        <input type="text" name="nationality" defaultValue={profile.nationality ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("employeeCategoryLabel")}</label>
        <select name="employeeCategory" defaultValue={profile.employee_category ?? ""} className={inputClass}>
          <option value="">{t("employeeCategoryPlaceholder")}</option>
          <option value="Academic">{t("employeeCategoryAcademic")}</option>
          <option value="Administrative">{t("employeeCategoryAdministrative")}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("insuranceCategoryLabel")}</label>
        <input
          type="text"
          name="insuranceCategory"
          dir="ltr"
          defaultValue={profile.insurance_category ?? ""}
          className={inputClass}
        />
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2 rounded-lg bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
