"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addPosition } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface LevelOption {
  id: string;
  name_ar: string;
}

export function AddOrgStructurePositionForm({
  levels,
  defaultLevelId,
  headingKey = "addPositionHeading",
}: {
  levels: LevelOption[];
  defaultLevelId?: string;
  headingKey?: string;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // `selectedLevelId` is only ever set by the user explicitly picking an
  // option; the actual value used everywhere below falls back to the first
  // available level, recomputed fresh on every render. This avoids seeding
  // useState from `levels[0]?.id` (which would go stale the moment `levels`
  // transitions from empty to non-empty via router.refresh() after adding
  // the first level — found live: `addPosition("", ...)` silently failing
  // validation because the stored "" never updated).
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const levelId = defaultLevelId ?? selectedLevelId ?? levels[0]?.id ?? "";
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
      const res = await addPosition(levelId, nameAr, nameEn);
      if (res.status === "success") {
        setNameAr("");
        setNameEn("");
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (levels.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="sru-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t(headingKey)}</h3>
      {!defaultLevelId && (
        <div>
          <label className="block text-sm font-medium mb-1">{t("positionLevelLabel")}</label>
          <select value={levelId} onChange={(e) => setSelectedLevelId(e.target.value)} required className={inputClass}>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name_ar}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">{t("positionNameArLabel")}</label>
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t("positionNameEnLabel")}</label>
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary">
        {t("addPositionButton")}
      </button>
    </form>
  );
}
