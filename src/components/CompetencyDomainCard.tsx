"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
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

/**
 * A domain block inside its pillar's card -- the top border + padding here
 * (not a nested .sru-card) is what visually separates one domain from the
 * next and from the pillar header above it (2026-08-29: "المحاور والمجالات
 * داخلة مع بعضها"). View/edit is a real toggle, same as CompetencyPillarCard.
 */
export function CompetencyDomainCard({
  domainId,
  orderLabel,
  initialNameAr,
  initialNameEn,
  canManage,
  canDelete,
  children,
}: {
  domainId: string;
  /** Dotted sub-number relative to the pillar, e.g. "1.2" for the 2nd domain of the 1st pillar (2026-08-29: "اجعل المجالات ارقام فرعية كأن تكتب 1.1"). */
  orderLabel: string;
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
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setError(null);
    setNameAr(initialNameAr);
    setNameEn(initialNameEn ?? "");
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateCompetencyDomain(domainId, nameAr, nameEn);
      if (res.status === "success") {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.message);
      }
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
    <div style={{ borderTop: "1px solid var(--sru-border)", paddingTop: 16, marginTop: 16 }}>
      {isEditing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="sru-order-badge sru-order-badge-domain" aria-hidden>
            {orderLabel}
          </span>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 220, fontSize: 13, fontWeight: 700 }} autoFocus />
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 200, fontSize: 13 }} />
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
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="sru-order-badge sru-order-badge-domain" aria-hidden>
            {orderLabel}
          </span>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--sru-blue)" }}>{initialNameAr}</h3>
          {canManage && (
            <div className="sru-icon-action-group no-print">
              <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
                <Pencil size={13} />
              </button>
              {canDelete && (
                <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
          {error && (
            <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
