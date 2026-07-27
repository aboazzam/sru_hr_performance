"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateJobTitleCore } from "@/app/[locale]/(app)/career-path/job-titles/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

const categories = ["leadership", "academic", "admin", "technical", "labor"] as const;

export function JobTitleCoreForm({
  jobTitleId,
  initial,
  jobFamilies,
  canEdit,
}: {
  jobTitleId: string;
  initial: {
    nameAr: string;
    nameEn: string | null;
    jobFamilyId: string;
    gradeLevel: number;
    category: string;
    qualificationRequired: string | null;
  };
  jobFamilies: Array<{ id: string; nameAr: string }>;
  canEdit: boolean;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [nameAr, setNameAr] = useState(initial.nameAr);
  const [nameEn, setNameEn] = useState(initial.nameEn ?? "");
  const [jobFamilyId, setJobFamilyId] = useState(initial.jobFamilyId);
  const [gradeLevel, setGradeLevel] = useState(String(initial.gradeLevel));
  const [category, setCategory] = useState(initial.category);
  const [qualificationRequired, setQualificationRequired] = useState(initial.qualificationRequired ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isDirty =
    nameAr !== initial.nameAr ||
    nameEn !== (initial.nameEn ?? "") ||
    jobFamilyId !== initial.jobFamilyId ||
    gradeLevel !== String(initial.gradeLevel) ||
    category !== initial.category ||
    qualificationRequired !== (initial.qualificationRequired ?? "");

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateJobTitleCore({
        jobTitleId,
        nameAr,
        nameEn: nameEn || undefined,
        jobFamilyId,
        gradeLevel: Number(gradeLevel),
        category,
        qualificationRequired: qualificationRequired || undefined,
      });
      if (res.status === "success") {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
      <div>
        <label className="block text-sm font-medium mb-1">{t("coreNameArLabel")}</label>
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} disabled={!canEdit} dir="rtl" className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t("coreNameEnLabel")}</label>
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={!canEdit} dir="ltr" className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t("coreFamilyLabel")}</label>
        <select value={jobFamilyId} onChange={(e) => setJobFamilyId(e.target.value)} disabled={!canEdit} className={inputClass}>
          {jobFamilies.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nameAr}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("coreGradeLabel")}</label>
          <input
            type="number"
            min={1}
            max={16}
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            disabled={!canEdit}
            dir="ltr"
            className={inputClass}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("coreCategoryLabel")}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canEdit} className={inputClass}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t(`category_${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t("coreQualificationLabel")}</label>
        <textarea
          value={qualificationRequired}
          onChange={(e) => setQualificationRequired(e.target.value)}
          disabled={!canEdit}
          dir="rtl"
          rows={2}
          className={inputClass}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {saved && !isDirty && (
        <p role="status" className="text-sm text-green-700">
          {t("saveSuccess")}
        </p>
      )}
      {canEdit && (
        <button
          type="button"
          disabled={isPending || !isDirty || nameAr.trim().length === 0}
          onClick={handleSave}
          className="sru-btn sru-btn-primary"
          style={{ alignSelf: "flex-start" }}
        >
          {isPending ? t("saving") : t("save")}
        </button>
      )}
    </div>
  );
}
