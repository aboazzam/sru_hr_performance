"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, IdCard, ShieldCheck, User, CheckCircle2, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import { inviteEmployee, type InviteEmployeeState } from "@/app/[locale]/(app)/employees/new/actions";

/** Client-side only — never sent anywhere until the admin actually submits the form. */
function generateSuggestedPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

interface RoleOption {
  id: string;
  name_ar: string;
}

interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number;
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
  jobTitles,
}: {
  orgUnits: OrgUnitOption[];
  roles: RoleOption[];
  jobTitles: JobTitleOption[];
}) {
  const t = useTranslations("EmployeeInvitePage");
  const [state, formAction, pending] = useActionState<InviteEmployeeState, FormData>(
    inviteEmployee,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"invite" | "direct">("invite");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // "Adjust state during rendering" (not inside the effect below) so this
  // doesn't trip react-hooks/set-state-in-effect — React's own documented
  // pattern for deriving state from a changed value rather than setting it
  // as a side effect (a ref can't be read/written during render under the
  // current lint rules, hence useState here instead). formRef.current?.reset()
  // stays in the effect since it's a real DOM mutation, not React state.
  const [lastHandledState, setLastHandledState] = useState<InviteEmployeeState>(null);
  if (state?.status === "success" && state !== lastHandledState) {
    setLastHandledState(state);
    setMode("invite");
    setPassword("");
  }

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction}>
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
            <input type="text" name="employeeNumber" required placeholder={t("employeeNumberPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("emailLabel")}</label>
            <input type="email" name="email" required dir="ltr" style={{ textAlign: "left" }} placeholder={t("emailPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("fullNameArLabel")}</label>
            <input type="text" name="fullNameAr" required dir="rtl" placeholder={t("fullNameArPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("fullNameEnLabel")}</label>
            <input type="text" name="fullNameEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("fullNameEnPlaceholder")} />
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
            <input type="date" name="dateOfBirth" dir="ltr" />
          </div>
          <div className="sru-field">
            <label>{t("nationalityLabel")}</label>
            <input type="text" name="nationality" placeholder={t("nationalityPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("genderLabel")}</label>
            <select name="gender" defaultValue="">
              <option value="">{t("genderPlaceholder")}</option>
              <option value="Male">{t("genderMale")}</option>
              <option value="Female">{t("genderFemale")}</option>
            </select>
          </div>
          <div className="sru-field">
            <label>{t("maritalStatusLabel")}</label>
            <select name="maritalStatus" defaultValue="">
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
            <select name="orgUnitId" required defaultValue="">
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
            <select name="jobTitleId" defaultValue="">
              <option value="">{t("jobTitlePlaceholder")}</option>
              {jobTitles.map((title) => (
                <option key={title.id} value={title.id}>
                  {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("hireDateLabel")}</label>
            <input type="date" name="hireDate" dir="ltr" />
          </div>
          <div className="sru-field">
            <label>{t("mobileLabel")}</label>
            <input type="text" name="mobile" dir="ltr" style={{ textAlign: "left" }} placeholder={t("mobilePlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("qualificationLabel")}</label>
            <input type="text" name="qualification" placeholder={t("qualificationPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("educationSpecialityLabel")}</label>
            <input type="text" name="educationSpeciality" placeholder={t("educationSpecialityPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("employeeCategoryLabel")}</label>
            <select name="employeeCategory" defaultValue="">
              <option value="">{t("employeeCategoryPlaceholder")}</option>
              <option value="Academic">{t("employeeCategoryAcademic")}</option>
              <option value="Administrative">{t("employeeCategoryAdministrative")}</option>
            </select>
          </div>
          <div className="sru-field">
            <label>{t("insuranceCategoryLabel")}</label>
            <input type="text" name="insuranceCategory" dir="ltr" style={{ textAlign: "left" }} placeholder={t("insuranceCategoryPlaceholder")} />
          </div>
        </div>
      </section>

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
          <div className="sru-field sru-scope-block">
            <label>{t("accountModeLabel")}</label>
            <div className="sru-scope-chip-row">
              <label className="sru-scope-chip">
                <input
                  type="radio"
                  name="mode"
                  value="invite"
                  checked={mode === "invite"}
                  onChange={() => setMode("invite")}
                />
                {t("accountModeInvite")}
              </label>
              <label className="sru-scope-chip">
                <input
                  type="radio"
                  name="mode"
                  value="direct"
                  checked={mode === "direct"}
                  onChange={() => setMode("direct")}
                />
                {t("accountModeDirect")}
              </label>
            </div>
            <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>
              {mode === "invite" ? t("accountModeInviteHint") : t("accountModeDirectHint")}
            </span>
          </div>

          {mode === "direct" && (
            <div className="sru-field has-toggle">
              <label>{t("passwordLabel")}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  minLength={8}
                  dir="ltr"
                  style={{ textAlign: "left", flex: 1 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("suggestPasswordButton")}
                  aria-label={t("suggestPasswordButton")}
                  onClick={() => {
                    setPassword(generateSuggestedPassword());
                    setShowPassword(true);
                  }}
                >
                  <Sparkles size={15} />
                </button>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={showPassword ? t("hidePassword") : t("showPassword")}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("passwordHint")}</span>
            </div>
          )}

          <div className="sru-field sru-scope-block">
            <label>{t("roleLabel")}</label>
            <div className="sru-scope-orgunits">
              {roles.map((role) => (
                <label key={role.id}>
                  <input type="checkbox" name="roleIds" value={role.id} />
                  {role.name_ar}
                </label>
              ))}
            </div>
          </div>
          <div className="sru-field sru-scope-block">
            <label>{t("scopeLabel")}</label>
            <div className="sru-scope-chip-row">
              <label className="sru-scope-chip">
                <input type="radio" name="scopeType" value="all" defaultChecked />
                {t("scopeAllOption")}
              </label>
              <label className="sru-scope-chip">
                <input type="radio" name="scopeType" value="org_unit" />
                {t("scopeOrgUnitOption")}
              </label>
            </div>
            <div className="sru-scope-orgunits">
              {orgUnits.map((unit) => (
                <label key={unit.id}>
                  <input type="checkbox" name="scopeOrgUnitIds" value={unit.id} />
                  {unit.name_ar}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      {state?.status === "success" && (
        <p role="status" className="sru-auth-alert success">
          <CheckCircle2 size={15} aria-hidden />
          {state.mode === "direct"
            ? t("successMessageDirect", { email: state.email })
            : t("successMessage", { email: state.email })}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
          {pending ? t("submitting") : mode === "direct" ? t("submitDirect") : t("submit")}
        </button>
      </div>
    </form>
  );
}
