"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, IdCard, ShieldCheck, User, CheckCircle2, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import { inviteEmployee, type InviteEmployeeState, type InviteFieldError } from "@/app/[locale]/(app)/employees/new/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";

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

/** Per-condition messages for `invalid_input` (2026-07-26) -- replaces one
 * generic bundled message that listed every possible cause regardless of
 * which one actually failed. */
const fieldErrorKeys: Record<InviteFieldError, string> = {
  employeeNumber: "errorFieldEmployeeNumber",
  fullNameAr: "errorFieldFullNameAr",
  orgUnitId: "errorFieldOrgUnit",
  roleIds: "errorFieldRole",
  scopeOrgUnitIds: "errorFieldScopeOrgUnits",
  password: "errorFieldPassword",
  identifier: "errorFieldIdentifier",
  other: "errorInvalidInput",
};

export function EmployeeInviteForm({
  orgUnits,
  roles,
  jobTitles,
  canManageUsers,
}: {
  orgUnits: OrgUnitOption[];
  roles: RoleOption[];
  jobTitles: JobTitleOption[];
  canManageUsers: boolean;
}) {
  const t = useTranslations("EmployeeInvitePage");
  const [state, formAction, pending] = useActionState<InviteEmployeeState, FormData>(
    inviteEmployee,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  // "none" (no account, data only) is the only option for callers who don't
  // hold userManagement -- the Role & Permissions section below doesn't even
  // render for them, so this stays "none" for the whole session in that case.
  const [mode, setMode] = useState<"none" | "invite" | "direct">(canManageUsers ? "invite" : "none");
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
    setMode(canManageUsers ? "invite" : "none");
    setPassword("");
  }

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  // React 19's <form action={fn}> resets every uncontrolled field after ANY
  // submission completes -- success OR error -- not just on success (found
  // live: a validation error wiped employeeNumber/fullNameAr/etc. while the
  // controlled `password` field survived, since only uncontrolled inputs are
  // affected by the implicit native form.reset() React performs). Submitting
  // by hand instead of via the `action` prop sidesteps that automatic reset
  // entirely -- `formAction` still works when invoked directly with a
  // FormData, wrapped in startTransition so `pending` still tracks it.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
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
            <input type="email" name="email" dir="ltr" style={{ textAlign: "left" }} placeholder={t("emailPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("usernameLabel")}</label>
            <input type="text" name="username" dir="ltr" style={{ textAlign: "left" }} placeholder={t("usernamePlaceholder")} />
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
            <DateFieldDmy name="dateOfBirth" ariaLabel={t("dateOfBirthLabel")} />
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
            <DateFieldDmy name="hireDate" ariaLabel={t("hireDateLabel")} />
          </div>
          <div className="sru-field">
            <label>{t("mobileLabel")}</label>
            <input type="text" name="mobile" dir="ltr" style={{ textAlign: "left" }} placeholder={t("mobilePlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("qualificationLabel")}</label>
            <input type="text" name="qualification" placeholder={t("qualificationPlaceholder")} />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            {/* One per line — the column stores them exactly that way. */}
            <label>{t("certificatesLabel")}</label>
            <textarea name="certificates" rows={2} dir="rtl" placeholder={t("certificatesPlaceholder")} />
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
          <div className="sru-field sru-scope-block">
            <label>{t("accountModeLabel")}</label>
            <div className="sru-scope-chip-row">
              <label className="sru-scope-chip">
                <input
                  type="radio"
                  name="mode"
                  value="none"
                  checked={mode === "none"}
                  onChange={() => setMode("none")}
                />
                {t("accountModeNone")}
              </label>
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
            <span style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>
              {mode === "none" ? t("accountModeNoneHint") : mode === "invite" ? t("accountModeInviteHint") : t("accountModeDirectHint")}
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
              <span style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{t("passwordHint")}</span>
            </div>
          )}

          {mode !== "none" && (
            <>
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
            </>
          )}
        </div>
      </section>
      )}

      {state?.status === "error" && state.message === "invalid_input" && state.fields && state.fields.length > 0 && (
        <div role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {state.fields.map((field) => (
              <li key={field}>{t(fieldErrorKeys[field])}</li>
            ))}
          </ul>
        </div>
      )}

      {state?.status === "error" && !(state.message === "invalid_input" && state.fields && state.fields.length > 0) && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      {state?.status === "success" && (
        <p role="status" className="sru-auth-alert success">
          <CheckCircle2 size={15} aria-hidden />
          {state.mode === "direct"
            ? t("successMessageDirect", { email: state.email ?? "" })
            : state.mode === "invite"
              ? t("successMessage", { email: state.email ?? "" })
              : state.pendingApproval
                ? t("successMessagePending")
                : t("successMessageDataOnly")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
          {pending
            ? t("submitting")
            : mode === "direct"
              ? t("submitDirect")
              : mode === "none"
                ? t("submitDataOnly")
                : t("submit")}
        </button>
      </div>
    </form>
  );
}
