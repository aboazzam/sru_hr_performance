"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addLevel } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

// Compact trigger button opening a <dialog> modal (2026-07-25 request: the
// always-visible full-width card took up too much page height for such an
// occasional action -- reuses the exact pattern already established by
// ImportOrgStructureExcelForm).
export function AddOrgStructureLevelForm() {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addLevel(nameAr, nameEn);
      if (res.status === "success") {
        setNameAr("");
        setNameEn("");
        dialogRef.current?.close();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn">
        {t("addLevelTriggerButton")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{t("addLevelHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("levelNameArLabel")}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("levelNameEnLabel")}</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </p>
          )}
          <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary" style={{ alignSelf: "flex-start" }}>
            {t("addLevelButton")}
          </button>
        </form>
      </dialog>
    </>
  );
}
