"use client";

import { useTranslations } from "next-intl";

export function PrintButton() {
  const t = useTranslations("PrintButton");
  return (
    <button
      type="button"
      className="sru-print-btn no-print"
      onClick={() => window.print()}
    >
      {t("print")}
    </button>
  );
}
