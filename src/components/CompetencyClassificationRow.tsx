"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
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

/** One row in the "التصنيفات" management list -- a real view/edit toggle (pencil -> fields -> save/cancel), same as every other row in this module, instead of permanently-open inputs. */
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
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [autoApplyEverywhere, setAutoApplyEverywhere] = useState(initialAutoApplyEverywhere);
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setError(null);
    setNameAr(initialNameAr);
    setNameEn(initialNameEn ?? "");
    setAutoApplyEverywhere(initialAutoApplyEverywhere);
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateCompetencyClassification(classificationId, nameAr, nameEn, autoApplyEverywhere);
      if (res.status === "success") {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.message);
      }
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

  if (!isEditing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--sru-border)" }}>
        <strong style={{ fontSize: 13 }}>{initialNameAr}</strong>
        {initialNameEn && (
          <span dir="ltr" style={{ fontSize: 12, color: "var(--sru-muted)" }}>
            {initialNameEn}
          </span>
        )}
        {initialAutoApplyEverywhere && (
          <span className="sru-chip" style={{ background: "var(--sru-blue-light)", color: "var(--sru-blue)" }}>
            {t("autoApplyEverywhereLabel")}
          </span>
        )}
        <div className="sru-icon-action-group">
          <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
            <Pencil size={14} />
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

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--sru-border)" }}>
      <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 160, fontSize: 13 }} autoFocus />
      <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 160, fontSize: 13 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={autoApplyEverywhere} onChange={(e) => setAutoApplyEverywhere(e.target.checked)} />
        {t("autoApplyEverywhereLabel")}
      </label>
      <div className="sru-icon-action-group">
        <button type="button" disabled={isSaving} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
          <Check size={14} />
        </button>
        <button type="button" disabled={isSaving} onClick={handleCancel} className="sru-icon-action" title={t("cancelButton")} aria-label={t("cancelButton")}>
          <X size={14} />
        </button>
      </div>
      {error && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      )}
    </div>
  );
}
