"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addCompetencyPillar } from "@/app/[locale]/(app)/competencies/actions";

const inputClass =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/** "Client can add pillars" (CLAUDE.md §3) -- a compact trigger + <dialog> modal, same established pattern as AddOrgStructureLevelForm. */
export function AddCompetencyPillarForm() {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addCompetencyPillar(nameAr, nameEn);
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
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn sru-btn-primary">
        {t("addPillarTriggerButton")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("addPillarHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("pillarNameArLabel")}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("pillarNameEnLabel")}</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {t(errorMessageKeys[error] ?? "errorUnknown")}
            </p>
          )}
          <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary" style={{ alignSelf: "flex-start" }}>
            {t("addPillarButton")}
          </button>
        </form>
      </dialog>
    </>
  );
}
