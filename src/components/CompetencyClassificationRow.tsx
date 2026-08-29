"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateCompetencyClassification, deleteCompetencyClassification } from "@/app/[locale]/(app)/competencies/actions";

const inputClass =
  "w-full px-2 py-1 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  has_dependents: "errorHasDependentsClassification",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/** One editable row in the "التصنيفات" management list -- mirrors CompetencyDomainCard's always-editable-inputs pattern (a classification only ever has 3 small fields, no need for a view/edit toggle). */
export function CompetencyClassificationRow({
  classificationId,
  initialNameAr,
  initialNameEn,
  initialAutoApplyEverywhere,
  canDelete,
}: {
  classificationId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  initialAutoApplyEverywhere: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [autoApplyEverywhere, setAutoApplyEverywhere] = useState(initialAutoApplyEverywhere);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    nameAr !== initialNameAr || nameEn !== (initialNameEn ?? "") || autoApplyEverywhere !== initialAutoApplyEverywhere;

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateCompetencyClassification(classificationId, nameAr, nameEn, autoApplyEverywhere);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deleteClassificationConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deleteCompetencyClassification(classificationId);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--sru-border)" }}>
      <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 160, fontSize: 13 }} />
      <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 160, fontSize: 13 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={autoApplyEverywhere} onChange={(e) => setAutoApplyEverywhere(e.target.checked)} />
        {t("autoApplyEverywhereLabel")}
      </label>
      <div className="sru-icon-action-group">
        <button type="button" disabled={isSaving || !isDirty} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
          <Check size={14} />
        </button>
        {canDelete && (
          <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {error && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      )}
    </div>
  );
}
