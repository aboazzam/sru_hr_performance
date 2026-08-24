"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, ClipboardList } from "lucide-react";
import {
  createVacancy,
  type CreateVacancyState,
} from "@/app/[locale]/(app)/vacancies/new/actions";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import type { Locale } from "@/i18n/config";

interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number;
  /** The title's own recorded requirements — the fallback source, used only
   * when the career path records no transition into this title. */
  qualification_required: string | null;
}

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

/** career_path's own "متطلبات الانتقال", keyed by the job title an edge leads
 * TO — i.e. what's required to move into that job. Resolved server-side in
 * vacancies/new/page.tsx. */
type TransitionRequirements = Record<string, { fromName: string; text: string }[]>;

type ErrorMessage = Extract<CreateVacancyState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function CreateVacancyForm({
  locale,
  jobTitles,
  orgUnits,
  transitionRequirements,
}: {
  locale: Locale;
  jobTitles: JobTitleOption[];
  orgUnits: OrgUnitOption[];
  transitionRequirements: TransitionRequirements;
}) {
  const t = useTranslations("CreateVacancyPage");
  const [state, formAction, pending] = useActionState<CreateVacancyState, FormData>(
    createVacancy.bind(null, locale),
    null
  );

  // Same narrow-the-select search already used on CareerPathEdgesManager /
  // ProposePromotionForm: typing any part of a name filters the option list
  // (hamza-insensitive), instead of relying on the browser's first-letter jump.
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim();
  const filteredJobTitles =
    trimmedSearch === ""
      ? jobTitles
      : jobTitles.filter((title) => includesIgnoringHamza(title.name_ar, trimmedSearch));

  const [jobTitleId, setJobTitleId] = useState("");
  // A selection the current search no longer matches would be hidden but still
  // submitted — drop it instead, so what's submitted is always what's visible.
  const effectiveJobTitleId = filteredJobTitles.some((title) => title.id === jobTitleId)
    ? jobTitleId
    : "";

  const selectedJobTitle = jobTitles.find((title) => title.id === effectiveJobTitleId);

  // Every career-path edge leading INTO the selected job title carries its own
  // "متطلبات الانتقال". In the real data those texts agree wherever a title has
  // more than one predecessor, but that's a property of today's rows, not a
  // constraint — so distinct texts are all kept (joined), never silently
  // reduced to whichever edge happened to come first.
  const sources = effectiveJobTitleId ? (transitionRequirements[effectiveJobTitleId] ?? []) : [];
  const distinctTexts = [...new Set(sources.map((source) => source.text))];
  const careerPathRequirements = distinctTexts.join("\n");
  const sourceTitles = [...new Set(sources.map((source) => source.fromName).filter(Boolean))].join(
    "، "
  );

  // Fallback for the ~211 titles the career path records no transition into
  // (2026-08-04, requested after the career-path source shipped): the title's
  // own recorded requirements. Which source was used is always stated in the
  // hint below — the two are never silently blended under one label.
  const ownRequirements = selectedJobTitle?.qualification_required?.trim() ?? "";
  const sourceRequirements = careerPathRequirements || ownRequirements;
  const sourceKind: "careerPath" | "jobTitle" | "none" = careerPathRequirements
    ? "careerPath"
    : ownRequirements
      ? "jobTitle"
      : "none";

  // Requirements are prefilled from that career-path text and stay editable.
  // State is adjusted during render (React's documented pattern for deriving
  // from a changed value) rather than in an effect, which this repo's
  // react-hooks/set-state-in-effect rule rejects.
  const [requirements, setRequirements] = useState("");
  const [autoFilledText, setAutoFilledText] = useState("");
  const [syncedJobTitleId, setSyncedJobTitleId] = useState("");
  if (effectiveJobTitleId !== syncedJobTitleId) {
    setSyncedJobTitleId(effectiveJobTitleId);
    // Never clobber text the admin typed themselves — only replace an empty box
    // or the text this form filled in for the previous job title.
    if (requirements.trim() === "" || requirements === autoFilledText) {
      setRequirements(sourceRequirements);
      setAutoFilledText(sourceRequirements);
    }
  }

  function useSourceRequirements() {
    setRequirements(sourceRequirements);
    setAutoFilledText(sourceRequirements);
  }

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Briefcase size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionDetailsTitle")}</h3>
            <span>{t("sectionDetailsSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("jobTitleLabel")}</label>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("jobTitleSearchPlaceholder")}
              dir="rtl"
              style={{ marginBottom: 6 }}
            />
            <select
              name="jobTitleId"
              required
              value={effectiveJobTitleId}
              onChange={(event) => setJobTitleId(event.target.value)}
              disabled={filteredJobTitles.length === 0}
            >
              {filteredJobTitles.length === 0 ? (
                <option value="">{t("jobTitleNoMatches")}</option>
              ) : (
                <>
                  <option value="" disabled>
                    {t("jobTitlePlaceholder")}
                  </option>
                  {filteredJobTitles.map((title) => (
                    <option key={title.id} value={title.id}>
                      {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

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
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <ClipboardList size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionRequirementsTitle")}</h3>
            <span>{t("sectionRequirementsSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("requirementsLabel")}</label>
            <textarea
              name="requirementsAr"
              dir="rtl"
              rows={4}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              placeholder={t("requirementsPlaceholder")}
            />
            {selectedJobTitle && (
              <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginTop: 6 }}>
                {sourceKind === "none" ? (
                  t("requirementsNoSource")
                ) : requirements === sourceRequirements ? (
                  sourceKind === "careerPath" ? (
                    t("requirementsFromCareerPath", { fromTitles: sourceTitles })
                  ) : (
                    t("requirementsFromJobTitle", { jobTitle: selectedJobTitle.name_ar })
                  )
                ) : (
                  <button
                    type="button"
                    onClick={useSourceRequirements}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      font: "inherit",
                      color: "var(--sru-purple)",
                      fontWeight: 700,
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    {sourceKind === "careerPath"
                      ? t("requirementsUseSource")
                      : t("requirementsUseJobTitleSource")}
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
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
