"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addLevel } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function AddOrgStructureLevelForm() {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
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
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="sru-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("addLevelHeading")}</h3>
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
      <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary">
        {t("addLevelButton")}
      </button>
    </form>
  );
}
