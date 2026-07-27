"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

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
        linkJobTitleId: linkEnabled ? linkJobTitleId : undefined,
        linkDirection: linkEnabled ? linkDirection : undefined,
        linkRequirementsAr: linkEnabled ? linkRequirementsAr || undefined : undefined,
      });
      if (res.status === "error") setError(res.message);
      // on success the action itself redirects — no further handling here.
    });
  }

  return (
    <div style={{ display: "grid", gap: 28, maxWidth: 720 }}>
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t("basicHeading")}</h2>
        <div className="sru-card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("nameArLabel")}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("nameEnLabel")}</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("familyLabel")}</label>
            <select value={jobFamilyId} onChange={(e) => setJobFamilyId(e.target.value)} className={inputClass}>
              {jobFamilies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nameAr}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="block text-sm font-medium mb-1">{t("gradeLabelInput")}</label>
              <input
                type="number"
                min={1}
                max={16}
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                dir="ltr"
                className={inputClass}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="block text-sm font-medium mb-1">{t("categoryLabel")}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {t(`category_${c}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("qualificationLabel")}</label>
            <textarea
              value={qualificationRequired}
              onChange={(e) => setQualificationRequired(e.target.value)}
              dir="rtl"
              rows={2}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t("descriptionHeading")}</h2>
        <div className="sru-card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <textarea
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            dir="rtl"
            rows={6}
            placeholder={t("descriptionPlaceholder")}
            className={inputClass}
          />
          <SuggestDescriptionButton
            nameAr={nameAr}
            familyNameAr={familyNameAr}
            gradeLevel={parsedGrade || null}
            category={category}
            qualificationRequired={qualificationRequired || undefined}
            onSuggested={setDescriptionAr}
          />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t("competenciesHeading")}</h2>
        <div className="sru-card" style={{ padding: 16 }}>
          <StagedCompetenciesPicker value={competencies} onChange={setCompetencies} allCompetencies={allCompetencies} />
          {!allLevelsChosen && (
            <p style={{ fontSize: 12.5, color: "var(--sru-muted)", marginTop: 8 }}>{t("levelsRequiredNote")}</p>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t("linkHeading")}</h2>
        <div className="sru-card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={linkEnabled} onChange={(e) => setLinkEnabled(e.target.checked)} />
            {t("linkEnableLabel")}
          </label>
          {linkEnabled && allJobTitles.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div>
                <label className="block text-sm font-medium mb-1">{t("linkDirectionLabel")}</label>
                <select
                  value={linkDirection}
                  onChange={(e) => setLinkDirection(e.target.value as "predecessor" | "successor")}
                  className={inputClass}
                >
                  <option value="predecessor">{t("linkDirectionPredecessor")}</option>
                  <option value="successor">{t("linkDirectionSuccessor")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("linkTargetLabel")}</label>
                <select value={linkJobTitleId} onChange={(e) => setLinkJobTitleId(e.target.value)} className={inputClass}>
                  {allJobTitles.map((jt) => (
                    <option key={jt.id} value={jt.id}>
                      {jt.nameAr} ({t("gradeLabel", { grade: jt.gradeLevel })})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="block text-sm font-medium mb-1">{t("linkRequirementsLabel")}</label>
                <input
                  value={linkRequirementsAr}
                  onChange={(e) => setLinkRequirementsAr(e.target.value)}
                  dir="rtl"
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit || isPending}
        onClick={handleSubmit}
        className="sru-btn sru-btn-primary"
        style={{ alignSelf: "flex-start" }}
      >
        {isPending ? t("creating") : t("createButton")}
      </button>
    </div>
  );
}
