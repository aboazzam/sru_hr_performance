"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addStrategicValue } from "@/app/[locale]/(app)/kpis/strategic-identity/actions";

const inputClass =
  "px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function AddStrategicValueForm() {
  const t = useTranslations("StrategicIdentityPage");
  const router = useRouter();
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
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 12 }}>
      <input
        value={titleAr}
        onChange={(e) => setTitleAr(e.target.value)}
        dir="rtl"
        className={inputClass}
        style={{ maxWidth: 160 }}
        placeholder={t("valueTitleArPlaceholder")}
      />
      <input
        value={titleEn}
        onChange={(e) => setTitleEn(e.target.value)}
        dir="ltr"
        className={inputClass}
        style={{ maxWidth: 160 }}
        placeholder={t("valueTitleEnPlaceholder")}
      />
      <input
        value={descriptionAr}
        onChange={(e) => setDescriptionAr(e.target.value)}
        dir="rtl"
        className={inputClass}
        style={{ maxWidth: 260 }}
        placeholder={t("valueDescriptionPlaceholder")}
      />
      <button type="button" disabled={isSaving || !titleAr.trim()} onClick={handleAdd} className="sru-btn sru-btn-primary" style={{ fontSize: 13, padding: "6px 12px" }}>
        {isSaving ? t("addingValue") : t("addValueButton")}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      )}
    </div>
  );
}
