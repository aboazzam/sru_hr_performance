"use client";

import { useState, useTransition } from "react";
import { Pencil, Archive, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateCompetency, updateCompetencyLevels, archiveCompetency } from "@/app/[locale]/(app)/competencies/actions";
import { behavioralLevelOrder, isCompetencyLevelsComplete, type BehavioralLevel } from "@/lib/competencyFramework";
import { behavioralLevelLabels } from "@/lib/data/competencies";

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

interface ClassificationOption {
  id: string;
  name_ar: string;
  auto_apply_everywhere: boolean;
}

export function CompetencyManageCard({
  competencyId,
  orderLabel,
  initialNameAr,
  initialClassificationId,
  initialDefinitionAr,
  initialExpectedImpactAr,
  initialJobFamilyId,
  initialLevels,
  jobFamilies,
  classifications,
  canManage,
}: {
  competencyId: string;
  /** Dotted sub-number relative to the pillar and domain, e.g. "1.2.3" for the 3rd competency of the 2nd domain of the 1st pillar (2026-08-29: "وفي الجدارات 1.1.1"). */
  orderLabel: string;
  initialNameAr: string;
  initialClassificationId: string;
  initialDefinitionAr: string;
  initialExpectedImpactAr: string;
  initialJobFamilyId: string | null;
  initialLevels: Partial<Record<BehavioralLevel, { behavior_ar: string }>>;
  jobFamilies: JobFamilyOption[];
  classifications: ClassificationOption[];
  canManage: boolean;
}) {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isArchiving, startArchiving] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [classificationId, setClassificationId] = useState(initialClassificationId);
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
  const initialClassification = classifications.find((c) => c.id === initialClassificationId);
  const selectedClassification = classifications.find((c) => c.id === classificationId) ?? initialClassification;
  const showJobFamily = selectedClassification ? !selectedClassification.auto_apply_everywhere : true;

  function handleEdit() {
    setError(null);
    setNameAr(initialNameAr);
    setClassificationId(initialClassificationId);
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
        classificationId,
        definitionAr,
        expectedImpactAr,
        jobFamilyId: showJobFamily && jobFamilyId ? jobFamilyId : null,
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span className="sru-order-badge sru-order-badge-competency" aria-hidden>
              {orderLabel}
            </span>
            <span>{initialNameAr}</span>
          </span>
          <span className="sru-chip">{initialClassification?.name_ar ?? "—"}</span>
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
        <span className="sru-order-badge sru-order-badge-competency" style={{ alignSelf: "flex-start" }} aria-hidden>
          {orderLabel}
        </span>
        <div>
          <label className="block text-sm font-medium mb-1">{t("competencyNameArLabel")}</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="block text-sm font-medium mb-1">{t("competencyClassificationLabel")}</label>
            <select value={classificationId} onChange={(e) => setClassificationId(e.target.value)} className={inputClass}>
              {classifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>
          {showJobFamily && (
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
