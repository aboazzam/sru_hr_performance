"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addCompetencyClassification } from "@/app/[locale]/(app)/competencies/actions";
import { AddFormDialog } from "@/components/AddFormDialog";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * "زر اضف تصنيف ... تصنيفات قابلة للإضافة لاحقًا" -- on the shared
 * AddFormDialog (2026-08-29), so this header-level trigger matches the
 * page's other primary actions (تصدير/استيراد/محور) exactly, per direct
 * feedback asking every button to share one shape/color/size.
 */
export function AddCompetencyClassificationForm() {
  const t = useTranslations("CompetenciesPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [autoApplyEverywhere, setAutoApplyEverywhere] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await addCompetencyClassification(nameAr, nameEn, autoApplyEverywhere);
      if (res.status === "success") {
        setNameAr("");
        setNameEn("");
        setAutoApplyEverywhere(false);
        dialogRef.current?.close();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <AddFormDialog
      dialogRef={dialogRef}
      triggerLabel={t("addClassificationTriggerButton")}
      heading={t("addClassificationHeading")}
      closeLabel={t("closeButton")}
    >
      <div className="sru-formgrid">
        <div className="sru-field">
          <label>{t("classificationNameArLabel")}</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
        </div>
        <div className="sru-field">
          <label>{t("classificationNameEnLabel")}</label>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" style={{ textAlign: "left" }} />
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10 }}>
        <input type="checkbox" checked={autoApplyEverywhere} onChange={(e) => setAutoApplyEverywhere(e.target.checked)} />
        {t("autoApplyEverywhereLabel")}
      </label>
      <p style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{t("autoApplyEverywhereNote")}</p>

      {error && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="button" disabled={isPending || !nameAr.trim()} onClick={handleAdd} className="sru-btn sru-btn-primary">
          {t("addClassificationButton")}
        </button>
      </div>
    </AddFormDialog>
  );
}
