"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updatePosition, deletePosition } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function OrgStructurePositionMiniRow({
  positionId,
  initialNameAr,
  initialNameEn,
  parentLabel,
}: {
  positionId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  parentLabel: string;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    has_dependents: "errorHasDependentsPosition",
    unknown: "errorUnknown",
  };

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updatePosition(positionId, nameAr, nameEn);
      if (res.status === "success") {
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

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--sru-border)" }}>
      <span style={{ color: "var(--sru-muted)", fontSize: 11.5, minWidth: 80 }}>{parentLabel}</span>
      <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 180 }} />
      <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 180 }} />
      <div className="sru-icon-action-group">
        <button type="button" disabled={isSaving} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
          <Check size={14} />
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
