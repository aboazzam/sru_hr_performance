"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updatePosition, deletePosition } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

export function OrgStructurePositionMiniRow({
  positionId,
  initialNameAr,
  initialNameEn,
  initialOrgUnitId,
  orgUnits,
  parentLabel,
}: {
  positionId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  initialOrgUnitId: string | null;
  orgUnits: OrgUnitOption[];
  parentLabel: string;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  // Real feedback (2026-07-27): the name/org-unit fields were always
  // rendered as live inputs with no distinct "this is editable" affordance,
  // making it unclear a click would let you change them. Now defaults to a
  // plain read-only view with an explicit edit (pencil) button; the inputs
  // only appear once editing is entered, closing that discoverability gap.
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [orgUnitId, setOrgUnitId] = useState(initialOrgUnitId ?? "");
  const [error, setError] = useState<string | null>(null);

  const orgUnitName = orgUnits.find((u) => u.id === initialOrgUnitId)?.name_ar ?? t("positionOrgUnitNone");

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    has_dependents: "errorHasDependentsPosition",
    unknown: "errorUnknown",
  };

  function handleEdit() {
    setError(null);
    setNameAr(initialNameAr);
    setNameEn(initialNameEn ?? "");
    setOrgUnitId(initialOrgUnitId ?? "");
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updatePosition(positionId, nameAr, nameEn, orgUnitId || null);
      if (res.status === "success") {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deletePositionConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deletePosition(positionId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (!isEditing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--sru-border)" }}>
        <span style={{ color: "var(--sru-muted)", fontSize: 11.5, minWidth: 80 }}>{parentLabel}</span>
        <strong style={{ fontSize: 13 }}>{initialNameAr}</strong>
        {initialNameEn && (
          <span dir="ltr" style={{ fontSize: 12, color: "var(--sru-muted)" }}>
            {initialNameEn}
          </span>
        )}
        <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>({orgUnitName})</span>
        <div className="sru-icon-action-group">
          <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
            <Pencil size={14} />
          </button>
          <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
            <Trash2 size={14} />
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

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--sru-border)" }}>
      <span style={{ color: "var(--sru-muted)", fontSize: 11.5, minWidth: 80 }}>{parentLabel}</span>
      <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 180 }} autoFocus />
      <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 180 }} />
      <select
        value={orgUnitId}
        onChange={(e) => setOrgUnitId(e.target.value)}
        className={inputClass}
        style={{ maxWidth: 180 }}
        aria-label={t("positionOrgUnitLabel")}
      >
        <option value="">{t("positionOrgUnitNone")}</option>
        {orgUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name_ar}
          </option>
        ))}
      </select>
      <div className="sru-icon-action-group">
        <button type="button" disabled={isSaving} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
          <Check size={14} />
        </button>
        <button type="button" disabled={isSaving} onClick={handleCancel} className="sru-icon-action" title={t("cancelButton")} aria-label={t("cancelButton")}>
          <X size={14} />
        </button>
        <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
          <Trash2 size={14} />
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
