"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
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

/**
 * One pillar and everything under it, inside a single bordered card (2026-08-29
 * request: "تضع كل محور ومكوناته داخل كرت") -- domains render as clearly
 * separated blocks inside this same card (see the top border each one gets in
 * page.tsx), not as their own nested cards, mirroring how OrgStructureLevelCard
 * already contains its position rows.
 *
 * View/edit is a real TOGGLE (pencil -> edit fields -> save/cancel), same as
 * OrgStructurePositionMiniRow/CompetencyManageCard -- edit affordances show
 * only once "تحرير" is clicked, never both at once, per direct feedback that
 * always-editable inputs read as cluttered/"سيئة" next to a plain list.
 */
export function CompetencyPillarCard({
  pillarId,
  orderNumber,
  initialNameAr,
  initialNameEn,
  canManage,
  canDelete,
  children,
}: {
  pillarId: string;
  /** 1-based position among the pillars on this page -- shown as a numbered badge so pillars/domains read as an ordered list, not a flat set (2026-08-29: "اضف ترقيم"). */
  orderNumber: number;
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
      const res = await updateCompetencyPillar(pillarId, nameAr, nameEn);
      if (res.status === "success") {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.message);
      }
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
    <section className="sru-card competency-pillar-card" style={{ padding: 18, marginBottom: 24 }}>
      {isEditing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <span className="sru-order-badge sru-order-badge-pillar" aria-hidden>
            {orderNumber}
          </span>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 240, fontWeight: 700 }} autoFocus />
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 220 }} />
          <div className="sru-icon-action-group">
            <button type="button" disabled={isSaving} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
              <Check size={15} />
            </button>
            <button type="button" disabled={isSaving} onClick={handleCancel} className="sru-icon-action" title={t("cancelButton")} aria-label={t("cancelButton")}>
              <X size={15} />
            </button>
          </div>
          {error && (
            <span role="alert" className="text-sm text-red-600" style={{ fontSize: 12 }}>
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </span>
          )}
        </div>
      ) : (
        <div className="competency-pillar-head" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <span className="sru-order-badge sru-order-badge-pillar" aria-hidden>
            {orderNumber}
          </span>
          <h2 className="sru-title" style={{ fontSize: 16.5 }}>
            {initialNameAr}
          </h2>
          {canManage && (
            <div className="sru-icon-action-group no-print">
              <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
                <Pencil size={14} />
              </button>
              {canDelete && (
                <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
          {error && (
            <span role="alert" className="text-sm text-red-600" style={{ fontSize: 12 }}>
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
