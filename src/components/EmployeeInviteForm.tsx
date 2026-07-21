"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { inviteEmployee, type InviteEmployeeState } from "@/app/[locale]/(app)/employees/new/actions";

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

interface RoleOption {
  id: string;
  name_ar: string;
}

type ErrorMessage = Extract<InviteEmployeeState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  invite_failed: "errorInviteFailed",
  role_assignment_failed: "errorRoleAssignmentFailed",
  rate_limited: "errorRateLimited",
  unknown: "errorUnknown",
};

export function EmployeeInviteForm({
  orgUnits,
  roles,
}: {
  orgUnits: OrgUnitOption[];
  roles: RoleOption[];
}) {
  const t = useTranslations("EmployeeInvitePage");
  const [state, formAction, pending] = useActionState<InviteEmployeeState, FormData>(
    inviteEmployee,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const orgUnitsChecklistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form ref={formRef} action={formAction} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-medium mb-1">{t("employeeNumberLabel")}</label>
        <input
          type="text"
          name="employeeNumber"
          required
          className={inputClass}
          placeholder={t("employeeNumberPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("fullNameArLabel")}</label>
        <input
          type="text"
          name="fullNameAr"
          required
          dir="rtl"
          className={inputClass}
          placeholder={t("fullNameArPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("fullNameEnLabel")}</label>
        <input
          type="text"
          name="fullNameEn"
          dir="ltr"
          className={inputClass}
          placeholder={t("fullNameEnPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("emailLabel")}</label>
        <input
          type="email"
          name="email"
          required
          className={inputClass}
          placeholder={t("emailPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("orgUnitLabel")}</label>
        <select name="orgUnitId" required className={inputClass} defaultValue="">
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
        <label className="block text-sm font-medium mb-1">{t("hireDateLabel")}</label>
        <input type="date" name="hireDate" dir="ltr" className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("roleLabel")}</label>
        <select name="roleId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("rolePlaceholder")}
          </option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name_ar}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("scopeLabel")}</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scopeType"
              value="all"
              defaultChecked
              onChange={() => {
                if (orgUnitsChecklistRef.current) orgUnitsChecklistRef.current.style.display = "none";
              }}
            />
            {t("scopeAllOption")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scopeType"
              value="org_unit"
              onChange={() => {
                if (orgUnitsChecklistRef.current) orgUnitsChecklistRef.current.style.display = "block";
              }}
            />
            {t("scopeOrgUnitOption")}
          </label>
        </div>
        <div
          ref={orgUnitsChecklistRef}
          style={{ display: "none" }}
          className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] p-3 space-y-1"
        >
          {orgUnits.map((unit) => (
            <label key={unit.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="scopeOrgUnitIds" value={unit.id} />
              {unit.name_ar}
            </label>
          ))}
        </div>
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      {state?.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {t("successMessage", { email: state.email })}
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
