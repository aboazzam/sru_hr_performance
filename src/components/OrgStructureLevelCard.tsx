"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateLevel, deleteLevel } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function OrgStructureLevelCard({
  levelId,
  levelOrder,
  initialNameAr,
  initialNameEn,
  children,
}: {
  levelId: string;
  levelOrder: number;
  initialNameAr: string;
  initialNameEn: string | null;
  children: ReactNode;
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
    has_dependents: "errorHasDependentsLevel",
    unknown: "errorUnknown",
  };

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updateLevel(levelId, nameAr, nameEn);
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
        <span style={{ fontSize: 15, fontWeight: 700 }}>{levelOrder}.</span>
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ maxWidth: 220 }} />
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ maxWidth: 220 }} />
        <div className="sru-icon-action-group">
          <button type="button" disabled={isSaving} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
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
