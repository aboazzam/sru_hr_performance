"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, IdCard, FileText, Award, Route } from "lucide-react";
import { createJobTitle } from "@/app/[locale]/(app)/career-path/job-titles/actions";
import { StagedCompetenciesPicker, type StagedCompetency } from "@/components/StagedCompetenciesPicker";
import { SuggestDescriptionButton } from "@/components/SuggestDescriptionButton";
import type { Locale } from "@/i18n/config";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

const categories = ["leadership", "academic", "admin", "technical", "labor"] as const;

interface JobFamilyOption {
  id: string;
  nameAr: string;
}
interface CompetencyOption {
  id: string;
  nameAr: string;
  pillarAr: string;
}
interface JobTitleOption {
  id: string;
  nameAr: string;
  gradeLevel: number;
}

// Restyled (2026-08-03, "ضبط لي النموذج ليكون مثل نموذج اضافة موظف") to the
// same sru-formsection pattern as EmployeeInviteForm — see JobTitleCoreForm's
// comment on the existing job-title detail page for the same change.
export function CreateJobTitleForm({
  locale,
  jobFamilies,
  coreCompetencies,
  allCompetencies,
  allJobTitles,
}: {
  locale: Locale;
  jobFamilies: JobFamilyOption[];
  coreCompetencies: CompetencyOption[];
  allCompetencies: CompetencyOption[];
  allJobTitles: JobTitleOption[];
}) {
  const t = useTranslations("CareerPathNewJobTitlePage");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [jobFamilyId, setJobFamilyId] = useState(jobFamilies[0]?.id ?? "");
  const [gradeLevel, setGradeLevel] = useState("");
  const [category, setCategory] = useState<string>("admin");
  const [qualificationRequired, setQualificationRequired] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [competencies, setCompetencies] = useState<StagedCompetency[]>(
    coreCompetencies.map((c) => ({ competencyId: c.id, nameAr: c.nameAr, requiredLevel: "" }))
  );

  const [linkEnabled, setLinkEnabled] = useState(false);
  const [linkJobTitleId, setLinkJobTitleId] = useState(allJobTitles[0]?.id ?? "");
  const [linkDirection, setLinkDirection] = useState<"predecessor" | "successor">("predecessor");
  const [linkRequirementsAr, setLinkRequirementsAr] = useState("");

  // "اضف خاصية البحث بحيث اضع الحروف الاولى فيعطيني الوظائف المطابقة"
  // (2026-08-03): the same gap already fixed once for the EXISTING job
  // title's own career-path-link select (CareerPathEdgesManager, 2026-08-01)
  // — this is a separate, never-touched select for the SAME kind of
  // company-wide job-title list, used only when creating a brand new job
  // title with an optional initial link. Same substring-search technique.
  const [linkSearch, setLinkSearch] = useState("");
  const trimmedLinkSearch = linkSearch.trim();
  const filteredLinkOptions =
    trimmedLinkSearch === "" ? allJobTitles : allJobTitles.filter((jt) => jt.nameAr.includes(trimmedLinkSearch));
  const effectiveLinkJobTitleId = filteredLinkOptions.some((jt) => jt.id === linkJobTitleId)
    ? linkJobTitleId
    : (filteredLinkOptions[0]?.id ?? "");

  const familyNameAr = jobFamilies.find((f) => f.id === jobFamilyId)?.nameAr ?? "";
  const parsedGrade = Number(gradeLevel);
  const allLevelsChosen = competencies.every((c) => c.requiredLevel !== "");

  const canSubmit =
    nameAr.trim().length > 0 &&
    !!jobFamilyId &&
    !!parsedGrade &&
    parsedGrade >= 1 &&
    parsedGrade <= 16 &&
    !!category &&
    competencies.length > 0 &&
    allLevelsChosen;

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await createJobTitle(locale, {
        nameAr,
        nameEn: nameEn || undefined,
        jobFamilyId,
        gradeLevel: parsedGrade,
        category,
        qualificationRequired: qualificationRequired || undefined,
        descriptionAr: descriptionAr || undefined,
        competencies: competencies.map((c) => ({ competencyId: c.competencyId, requiredLevel: c.requiredLevel })),
        linkJobTitleId: linkEnabled ? effectiveLinkJobTitleId : undefined,
        linkDirection: linkEnabled ? linkDirection : undefined,
        linkRequirementsAr: linkEnabled ? linkRequirementsAr || undefined : undefined,
      });
      if (res.status === "error") setError(res.message);
      // on success the action itself redirects — no further handling here.
    });
  }

  return (
    <div>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <IdCard size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("basicHeading")}</h3>
            <span>{t("basicSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("nameArLabel")}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
          </div>
          <div className="sru-field">
            <label>{t("nameEnLabel")}</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" style={{ textAlign: "left" }} />
          </div>
          <div className="sru-field">
            <label>{t("familyLabel")}</label>
            <select value={jobFamilyId} onChange={(e) => setJobFamilyId(e.target.value)}>
              {jobFamilies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nameAr}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("gradeLabelInput")}</label>
            <input type="number" min={1} max={16} value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} dir="ltr" />
          </div>
          <div className="sru-field">
            <label>{t("categoryLabel")}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {t(`category_${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("qualificationLabel")}</label>
            <textarea value={qualificationRequired} onChange={(e) => setQualificationRequired(e.target.value)} dir="rtl" rows={2} />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <FileText size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("descriptionHeading")}</h3>
            <span>{t("descriptionSubtitle")}</span>
          </div>
        </div>
        <div className="sru-field">
          <textarea
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            dir="rtl"
            rows={6}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>
        <SuggestDescriptionButton
          nameAr={nameAr}
          familyNameAr={familyNameAr}
          gradeLevel={parsedGrade || null}
          category={category}
          qualificationRequired={qualificationRequired || undefined}
          onSuggested={setDescriptionAr}
        />
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Award size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("competenciesHeading")}</h3>
            <span>{t("competenciesSubtitle")}</span>
          </div>
        </div>
        <StagedCompetenciesPicker value={competencies} onChange={setCompetencies} allCompetencies={allCompetencies} />
        {!allLevelsChosen && <p style={{ fontSize: 12.5, color: "var(--sru-muted)", marginTop: 8 }}>{t("levelsRequiredNote")}</p>}
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Route size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("linkHeading")}</h3>
            <span>{t("linkSubtitle")}</span>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: linkEnabled ? 12 : 0 }}>
          <input type="checkbox" checked={linkEnabled} onChange={(e) => setLinkEnabled(e.target.checked)} />
          {t("linkEnableLabel")}
        </label>
        {linkEnabled && allJobTitles.length > 0 && (
          <div className="sru-formgrid">
            <div className="sru-field">
              <label>{t("linkDirectionLabel")}</label>
              <select value={linkDirection} onChange={(e) => setLinkDirection(e.target.value as "predecessor" | "successor")}>
                <option value="predecessor">{t("linkDirectionPredecessor")}</option>
                <option value="successor">{t("linkDirectionSuccessor")}</option>
              </select>
            </div>
            <div className="sru-field">
              <label>{t("linkTargetLabel")}</label>
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder={t("linkTargetSearchPlaceholder")}
                dir="rtl"
                style={{ marginBottom: 6 }}
              />
              <select
                value={effectiveLinkJobTitleId}
                onChange={(e) => setLinkJobTitleId(e.target.value)}
                disabled={filteredLinkOptions.length === 0}
              >
                {filteredLinkOptions.length === 0 ? (
                  <option value="">{t("linkTargetNoMatches")}</option>
                ) : (
                  filteredLinkOptions.map((jt) => (
                    <option key={jt.id} value={jt.id}>
                      {jt.nameAr} ({t("gradeLabel", { grade: jt.gradeLevel })})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="sru-field">
              <label>{t("linkRequirementsLabel")}</label>
              <input value={linkRequirementsAr} onChange={(e) => setLinkRequirementsAr(e.target.value)} dir="rtl" />
            </div>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="button" disabled={!canSubmit || isPending} onClick={handleSubmit} className="sru-btn sru-btn-primary">
          {isPending ? t("creating") : t("createButton")}
        </button>
      </div>
    </div>
  );
}
