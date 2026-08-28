"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateCompetencyPillar, deleteCompetencyPillar } from "@/app/[locale]/(app)/competencies/actions";

const inputClass =
  "w-full px-2 py-1 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  has_dependents: "errorHasDependentsPillar",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/** Read-only heading when the caller can't manage the framework; always-editable name inputs (like OrgStructureLevelCard) when they can -- just 2 fields, no toggle needed. */
export function CompetencyPillarCard({
  pillarId,
  initialNameAr,
  initialNameEn,
  canManage,
  canDelete,
  children,
}: {
  pillarId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  canManage: boolean;
  canDelete: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [error, setError] = useState<string | null>(null);

  const isDirty = nameAr !== initialNameAr || nameEn !== (initialNameEn ?? "");

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateCompetencyPillar(pillarId, nameAr, nameEn);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deletePillarConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deleteCompetencyPillar(pillarId);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  return (
    <section style={{ marginBottom: 44 }}>
      {canManage ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 240, fontWeight: 700 }} />
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 220 }} />
          <div className="sru-icon-action-group">
            <button type="button" disabled={isSaving || !isDirty} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
              <Check size={15} />
            </button>
            {canDelete && (
              <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {error && (
            <span role="alert" className="text-sm text-red-600" style={{ fontSize: 12 }}>
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </span>
          )}
        </div>
      ) : (
        <h2 className="sru-title" style={{ fontSize: 16.5, marginBottom: 18 }}>
          {initialNameAr}
        </h2>
      )}
      {children}
    </section>
  );
}
