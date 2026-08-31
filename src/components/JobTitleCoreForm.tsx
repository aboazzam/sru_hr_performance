"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, IdCard } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { updateJobTitleCore } from "@/app/[locale]/(app)/career-path/job-titles/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

const categories = ["leadership", "academic", "admin", "technical", "labor"] as const;

// Restyled (2026-08-03, "ضبط لي النموذج ليكون مثل نموذج اضافة موظف") to the
// same sru-formsection/sru-formgrid/sru-field pattern EmployeeInviteForm and
// every other multi-field form in this app already use, instead of this
// screen's own one-off plain labels/inputs.
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
    <section className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <IdCard size={17} aria-hidden />
        </span>
        <div>
          <h3>{t("coreHeading")}</h3>
          <span>{t("coreSubtitle")}</span>
        </div>
      </div>
      <div className="sru-formgrid">
        <div className="sru-field">
          <label>{t("coreNameArLabel")}</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} disabled={!canEdit} dir="rtl" />
        </div>
        <div className="sru-field">
          <label>{t("coreNameEnLabel")}</label>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={!canEdit} dir="ltr" style={{ textAlign: "left" }} />
        </div>
        <div className="sru-field">
          <label>{t("coreFamilyLabel")}</label>
          <select value={jobFamilyId} onChange={(e) => setJobFamilyId(e.target.value)} disabled={!canEdit}>
            {jobFamilies.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="sru-field">
          <label>{t("coreGradeLabel")}</label>
          <input
            type="text" inputMode="numeric"
            min={1}
            max={16}
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            disabled={!canEdit}
            dir="ltr"
          />
        </div>
        <div className="sru-field">
          <label>{t("coreCategoryLabel")}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canEdit}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t(`category_${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
          <label>{t("coreQualificationLabel")}</label>
          <textarea
            value={qualificationRequired}
            onChange={(e) => setQualificationRequired(e.target.value)}
            disabled={!canEdit}
            dir="rtl"
            rows={2}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {saved && !isDirty && (
        <p role="status" className="sru-auth-alert success">
          <CheckCircle2 size={15} aria-hidden />
          {t("saveSuccess")}
        </p>
      )}
      {canEdit && (
        <div className="sru-form-submitrow">
          <button
            type="button"
            disabled={isPending || !isDirty || nameAr.trim().length === 0}
            onClick={handleSave}
            className="sru-btn sru-btn-primary"
          >
            {isPending ? t("saving") : t("save")}
          </button>
        </div>
      )}
    </section>
  );
}
