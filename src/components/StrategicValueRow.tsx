"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateStrategicValue, deleteStrategicValue } from "@/app/[locale]/(app)/kpis/strategic-identity/actions";

const inputClass =
  "px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function StrategicValueRow({
  canEdit,
  valueId,
  initialTitleAr,
  initialTitleEn,
  initialDescriptionAr,
}: {
  // Read-only viewers (every authenticated user, since 20260730000004) get the
  // text with no edit/delete affordances — the icons used to render for
  // everyone who could reach this page, which was only ever three roles.
  // The real gate stays strategic_values' own write RLS.
  canEdit: boolean;
  valueId: string;
  initialTitleAr: string;
  initialTitleEn: string | null;
  initialDescriptionAr: string | null;
}) {
  const t = useTranslations("StrategicIdentityPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [titleAr, setTitleAr] = useState(initialTitleAr);
  const [titleEn, setTitleEn] = useState(initialTitleEn ?? "");
  const [descriptionAr, setDescriptionAr] = useState(initialDescriptionAr ?? "");
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalidInput",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

  function handleEdit() {
    setError(null);
    setTitleAr(initialTitleAr);
    setTitleEn(initialTitleEn ?? "");
    setDescriptionAr(initialDescriptionAr ?? "");
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateStrategicValue(valueId, titleAr, titleEn, descriptionAr);
      if (res.status === "success") {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deleteValueConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deleteStrategicValue(valueId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (!isEditing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--sru-border)" }}>
        <strong style={{ fontSize: 14 }}>{initialTitleAr}</strong>
        {initialTitleEn && (
          <span className="sru-name-en">
            {initialTitleEn}
          </span>
        )}
        {initialDescriptionAr && (
          <span style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>— {initialDescriptionAr}</span>
        )}
        {canEdit && (
          <div className="sru-icon-action-group">
            <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
              <Pencil size={14} />
            </button>
            <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
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
      <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" className={inputClass} style={{ maxWidth: 160 }} autoFocus />
      <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 160 }} />
      <input
        value={descriptionAr}
        onChange={(e) => setDescriptionAr(e.target.value)}
        dir="rtl"
        className={inputClass}
        style={{ maxWidth: 260 }}
        placeholder={t("valueDescriptionPlaceholder")}
      />
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
