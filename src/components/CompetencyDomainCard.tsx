"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateCompetencyDomain, deleteCompetencyDomain } from "@/app/[locale]/(app)/competencies/actions";

const inputClass =
  "w-full px-2 py-1 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  has_dependents: "errorHasDependentsDomain",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export function CompetencyDomainCard({
  domainId,
  initialNameAr,
  initialNameEn,
  canManage,
  canDelete,
  children,
}: {
  domainId: string;
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
      const res = await updateCompetencyDomain(domainId, nameAr, nameEn);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deleteDomainConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deleteCompetencyDomain(domainId);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div style={{ marginBottom: 22 }}>
      {canManage ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 220, fontSize: 13, fontWeight: 700 }} />
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 200, fontSize: 13 }} />
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
      ) : (
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--sru-blue)", marginBottom: 10 }}>{initialNameAr}</h3>
      )}
      {children}
    </div>
  );
}
