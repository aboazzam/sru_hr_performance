"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateLevel, deleteLevel } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-2 py-1 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function OrgStructureLevelCard({
  levelId,
  levelOrder,
  initialNameAr,
  initialNameEn,
  initialColor,
  defaultColorSwatch,
  identitySwatches,
  children,
}: {
  levelId: string;
  levelOrder: number;
  initialNameAr: string;
  initialNameEn: string | null;
  /** NULL = no admin override yet, chart falls back to the theme rotation. */
  initialColor: string | null;
  /** Starting swatch value shown in the picker before any override is chosen. */
  defaultColorSwatch: string;
  /** Quick-pick colors derived from the real org_identity primary/secondary colors — same list for every level. */
  identitySwatches: string[];
  children: ReactNode;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [color, setColor] = useState<string | null>(initialColor);
  const [error, setError] = useState<string | null>(null);

  const isDirty = nameAr !== initialNameAr || nameEn !== (initialNameEn ?? "") || color !== initialColor;

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    has_dependents: "errorHasDependentsLevel",
    unknown: "errorUnknown",
  };

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateLevel(levelId, nameAr, nameEn, color);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deleteLevelConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deleteLevel(levelId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div className="sru-card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{levelOrder}.</span>
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 220 }} />
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 220 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, color: "var(--sru-muted)" }}>{t("customColorLabel")}</span>
          <input
            type="color"
            value={color ?? defaultColorSwatch}
            onChange={(e) => setColor(e.target.value)}
            className="sru-color-swatch"
            title={t("customColorLabel")}
            aria-label={t("customColorLabel")}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, color: "var(--sru-muted)" }}>{t("identityColorsLabel")}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {identitySwatches.map((swatch, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setColor(swatch)}
                className={`sru-color-swatch-pick${color === swatch ? " selected" : ""}`}
                style={{ background: swatch }}
                title={swatch}
                aria-label={swatch}
              />
            ))}
          </div>
        </div>
        <div className="sru-icon-action-group">
          <button type="button" disabled={isSaving || !isDirty} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
            <Check size={15} />
          </button>
          <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginBottom: 10 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {children}
    </div>
  );
}
