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
  level_order: number;
}

interface PositionOption {
  id: string;
  name_ar: string;
  level_id: string;
}

export function AddOrgStructurePositionForm({
  levels,
  positions,
  defaultLevelId,
  headingKey = "addPositionHeading",
}: {
  levels: LevelOption[];
  positions: PositionOption[];
  defaultLevelId?: string;
  headingKey?: string;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // `selectedLevelId`/`selectedParentId` are only ever set by the user
  // explicitly picking an option; the actual values used everywhere below
  // fall back to sensible defaults recomputed fresh on every render. This
  // avoids seeding useState directly from a prop-derived default (which
  // would go stale the moment that prop transitions from empty to
  // non-empty via router.refresh() — found live: `addPosition("", ...)`
  // silently failing validation because a stored "" never updated).
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const levelId = defaultLevelId ?? selectedLevelId ?? levels[0]?.id ?? "";
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const minLevelOrder = levels.length > 0 ? Math.min(...levels.map((l) => l.level_order)) : null;
  const selectedLevel = levels.find((l) => l.id === levelId);
  const isRootLevel = selectedLevel != null && selectedLevel.level_order === minLevelOrder;
  const precedingLevel = selectedLevel
    ? levels.find((l) => l.level_order === selectedLevel.level_order - 1)
    : undefined;
  const parentOptions = precedingLevel ? positions.filter((p) => p.level_id === precedingLevel.id) : [];

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const parentId = selectedParentId ?? parentOptions[0]?.id ?? "";

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
      const res = await addPosition(levelId, nameAr, nameEn, isRootLevel ? undefined : parentId);
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
      {!isRootLevel && (
        <div>
          <label className="block text-sm font-medium mb-1">{t("positionParentLabel")}</label>
          {parentOptions.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("noParentOptions")}</p>
          ) : (
            <select value={parentId} onChange={(e) => setSelectedParentId(e.target.value)} required className={inputClass}>
              {parentOptions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name_ar}
                </option>
              ))}
            </select>
          )}
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
      <button type="submit" disabled={isPending || (!isRootLevel && parentOptions.length === 0)} className="sru-btn sru-btn-primary">
        {t("addPositionButton")}
      </button>
    </form>
  );
}
