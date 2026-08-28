"use client";

import { useState, useTransition } from "react";
import { Pencil, Archive, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateCompetency, updateCompetencyLevels, archiveCompetency } from "@/app/[locale]/(app)/competencies/actions";
import { behavioralLevelOrder, isCompetencyLevelsComplete, type BehavioralLevel, type CompetencyType } from "@/lib/competencyFramework";
import { behavioralLevelLabels, competencyTypeLabels } from "@/lib/data/competencies";

const inputClass =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  has_dependents: "errorHasDependentsCompetency",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

interface JobFamilyOption {
  id: string;
  name_ar: string;
}

export function CompetencyManageCard({
  competencyId,
  initialNameAr,
  initialType,
  initialDefinitionAr,
  initialExpectedImpactAr,
  initialJobFamilyId,
  initialLevels,
  jobFamilies,
  canManage,
}: {
  competencyId: string;
  initialNameAr: string;
  initialType: CompetencyType;
  initialDefinitionAr: string;
  initialExpectedImpactAr: string;
  initialJobFamilyId: string | null;
  initialLevels: Partial<Record<BehavioralLevel, { behavior_ar: string }>>;
  jobFamilies: JobFamilyOption[];
  canManage: boolean;
}) {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isArchiving, startArchiving] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [type, setType] = useState<CompetencyType>(initialType);
  const [definitionAr, setDefinitionAr] = useState(initialDefinitionAr);
  const [expectedImpactAr, setExpectedImpactAr] = useState(initialExpectedImpactAr);
  const [jobFamilyId, setJobFamilyId] = useState(initialJobFamilyId ?? "");
  const [levels, setLevels] = useState<Record<BehavioralLevel, string>>(() => {
    const initial = {} as Record<BehavioralLevel, string>;
    for (const level of behavioralLevelOrder) initial[level] = initialLevels[level]?.behavior_ar ?? "";
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  const isComplete = isCompetencyLevelsComplete(initialLevels);

  function handleEdit() {
    setError(null);
    setNameAr(initialNameAr);
    setType(initialType);
    setDefinitionAr(initialDefinitionAr);
    setExpectedImpactAr(initialExpectedImpactAr);
    setJobFamilyId(initialJobFamilyId ?? "");
    const reset = {} as Record<BehavioralLevel, string>;
    for (const level of behavioralLevelOrder) reset[level] = initialLevels[level]?.behavior_ar ?? "";
    setLevels(reset);
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const fieldsRes = await updateCompetency({
        id: competencyId,
        nameAr,
        type,
        definitionAr,
        expectedImpactAr,
        jobFamilyId: type === "specialized" && jobFamilyId ? jobFamilyId : null,
      });
      if (fieldsRes.status !== "success") {
        setError(fieldsRes.message);
        return;
      }
      const levelsRes = await updateCompetencyLevels(competencyId, levels);
      if (levelsRes.status !== "success") {
        setError(levelsRes.message);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleArchive() {
    if (!window.confirm(t("archiveCompetencyConfirm"))) return;
    setError(null);
    startArchiving(async () => {
      const res = await archiveCompetency(competencyId);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  if (!isEditing) {
    return (
      <details className="sru-card competency-card">
        <summary>
          <span>{initialNameAr}</span>
          <span className="sru-chip" style={initialType === "specialized" ? { background: "var(--sru-blue-light)", color: "var(--sru-blue)" } : undefined}>
            {competencyTypeLabels[initialType]}
          </span>
          {!isComplete && (
            <span className="sru-chip" style={{ background: "#fef3c7", color: "#92400e" }}>
              {t("incompleteLevelsBadge")}
            </span>
          )}
        </summary>

        <div className="competency-body">
          <p style={{ fontSize: 12.5 }}>{initialDefinitionAr}</p>
          <p style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>
            <strong style={{ color: "var(--sru-ink)" }}>{t("expectedImpactLabel")} </strong>
            {initialExpectedImpactAr}
          </p>

          {behavioralLevelOrder.map((level) => (
            <div key={level} className="competency-level">
              <h4>{behavioralLevelLabels[level]}</h4>
              <ul>
                {(initialLevels[level]?.behavior_ar ?? "")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
              </ul>
            </div>
          ))}

          {canManage && (
            <div className="sru-icon-action-group no-print" style={{ marginTop: 10 }}>
              <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
                <Pencil size={14} />
              </button>
              <button type="button" disabled={isArchiving} onClick={handleArchive} className="sru-icon-action danger" title={t("archiveButton")} aria-label={t("archiveButton")}>
                <Archive size={14} />
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600" style={{ marginTop: 6 }}>
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </p>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="sru-card" style={{ padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label className="block text-sm font-medium mb-1">{t("competencyNameArLabel")}</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="block text-sm font-medium mb-1">{t("competencyTypeLabel")}</label>
            <select value={type} onChange={(e) => setType(e.target.value as CompetencyType)} className={inputClass}>
              <option value="core">{competencyTypeLabels.core}</option>
              <option value="specialized">{competencyTypeLabels.specialized}</option>
            </select>
          </div>
          {type === "specialized" && (
            <div style={{ flex: 1 }}>
              <label className="block text-sm font-medium mb-1">{t("jobFamilyLabel")}</label>
              <select value={jobFamilyId} onChange={(e) => setJobFamilyId(e.target.value)} className={inputClass}>
                <option value="">{t("jobFamilyNoneOption")}</option>
                {jobFamilies.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t("definitionArLabel")}</label>
          <textarea value={definitionAr} onChange={(e) => setDefinitionAr(e.target.value)} rows={3} className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t("expectedImpactArLabel")}</label>
          <textarea value={expectedImpactAr} onChange={(e) => setExpectedImpactAr(e.target.value)} rows={3} className={inputClass} />
        </div>

        {behavioralLevelOrder.map((level) => (
          <div key={level}>
            <label className="block text-sm font-medium mb-1">{behavioralLevelLabels[level]}</label>
            <textarea
              value={levels[level]}
              onChange={(e) => setLevels((prev) => ({ ...prev, [level]: e.target.value }))}
              rows={3}
              className={inputClass}
            />
          </div>
        ))}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </p>
        )}

        <div className="sru-icon-action-group">
          <button type="button" disabled={isSaving} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
            <Check size={15} />
          </button>
          <button type="button" disabled={isSaving} onClick={handleCancel} className="sru-icon-action" title={t("cancelButton")} aria-label={t("cancelButton")}>
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
