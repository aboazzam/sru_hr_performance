"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addCompetency } from "@/app/[locale]/(app)/competencies/actions";
import { behavioralLevelOrder, type BehavioralLevel, type CompetencyType } from "@/lib/competencyFramework";
import { behavioralLevelLabels, competencyTypeLabels } from "@/lib/data/competencies";

const inputClass =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

const emptyLevels: Record<BehavioralLevel, string> = {
  basic: "",
  practitioner: "",
  advanced: "",
  professional: "",
};

interface JobFamilyOption {
  id: string;
  name_ar: string;
}

/** "Client can add competencies" (CLAUDE.md §3) -- one competency, its type/definition/impact, and all 4 behavioral levels in one submission, matching the fact that every real competency in the framework already has all 4 filled in. */
export function AddCompetencyForm({ domainId, jobFamilies }: { domainId: string; jobFamilies: JobFamilyOption[] }) {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [nameAr, setNameAr] = useState("");
  const [type, setType] = useState<CompetencyType>("core");
  const [definitionAr, setDefinitionAr] = useState("");
  const [expectedImpactAr, setExpectedImpactAr] = useState("");
  const [jobFamilyId, setJobFamilyId] = useState("");
  const [levels, setLevels] = useState<Record<BehavioralLevel, string>>(emptyLevels);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setNameAr("");
    setType("core");
    setDefinitionAr("");
    setExpectedImpactAr("");
    setJobFamilyId("");
    setLevels(emptyLevels);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addCompetency({
        domainId,
        nameAr,
        type,
        definitionAr,
        expectedImpactAr,
        jobFamilyId: type === "specialized" && jobFamilyId ? jobFamilyId : undefined,
        levels,
      });
      if (res.status === "success") {
        resetForm();
        dialogRef.current?.close();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn" style={{ fontSize: 12.5, padding: "6px 12px" }}>
        {t("addCompetencyTriggerButton")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("addCompetencyHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "70vh", overflowY: "auto" }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("competencyNameArLabel")}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className={inputClass} />
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
            <textarea value={definitionAr} onChange={(e) => setDefinitionAr(e.target.value)} required rows={3} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("expectedImpactArLabel")}</label>
            <textarea value={expectedImpactAr} onChange={(e) => setExpectedImpactAr(e.target.value)} required rows={3} className={inputClass} />
          </div>

          <div className="sru-diag" style={{ margin: "4px 0" }} />
          <p style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("levelsNote")}</p>

          {behavioralLevelOrder.map((level) => (
            <div key={level}>
              <label className="block text-sm font-medium mb-1">{behavioralLevelLabels[level]}</label>
              <textarea
                value={levels[level]}
                onChange={(e) => setLevels((prev) => ({ ...prev, [level]: e.target.value }))}
                required
                rows={3}
                className={inputClass}
                placeholder={t("levelTextareaPlaceholder")}
              />
            </div>
          ))}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </p>
          )}
          <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary" style={{ alignSelf: "flex-start" }}>
            {t("addCompetencyButton")}
          </button>
        </form>
      </dialog>
    </>
  );
}
