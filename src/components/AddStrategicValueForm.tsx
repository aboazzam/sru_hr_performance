"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addStrategicValue } from "@/app/[locale]/(app)/kpis/strategic-identity/actions";
import { AddFormDialog } from "@/components/AddFormDialog";

/**
 * "إضافة قيمة" — a trigger button opening the shared add-form dialog, the same
 * shape every other add form on a list screen now uses (2026-08-20).
 *
 * It used to be three bare inputs and a button sitting permanently under the
 * values list. Small, but the same complaint applies: the screen exists to
 * READ the values, and being the last form left in the old shape made it read
 * as unfinished next to everything else.
 */
export function AddStrategicValueForm() {
  const t = useTranslations("StrategicIdentityPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isSaving, startSaving] = useTransition();
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalidInput",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

  function handleAdd() {
    setError(null);
    startSaving(async () => {
      const res = await addStrategicValue(titleAr, titleEn, descriptionAr);
      if (res.status === "success") {
        setTitleAr("");
        setTitleEn("");
        setDescriptionAr("");
        // Closed only on success: an error keeps the dialog open with its
        // message inside, so nothing typed is lost.
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
      triggerLabel={t("addValueButton")}
      heading={t("addValueButton")}
      closeLabel={t("closeButton")}
    >
      <div className="sru-formgrid">
        <div className="sru-field">
          <label>{t("valueTitleArLabel")}</label>
          <input
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
            dir="rtl"
            placeholder={t("valueTitleArPlaceholder")}
          />
        </div>
        <div className="sru-field">
          <label>{t("valueTitleEnLabel")}</label>
          <input
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            dir="ltr"
            style={{ textAlign: "left" }}
            placeholder={t("valueTitleEnPlaceholder")}
          />
        </div>
        <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
          <label>{t("valueDescriptionLabel")}</label>
          <input
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            dir="rtl"
            placeholder={t("valueDescriptionPlaceholder")}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button
          type="button"
          disabled={isSaving || !titleAr.trim()}
          onClick={handleAdd}
          className="sru-btn sru-btn-primary"
        >
          {isSaving ? t("addingValue") : t("addValueButton")}
        </button>
      </div>
    </AddFormDialog>
  );
}
