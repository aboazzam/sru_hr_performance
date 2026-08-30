"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addPosition, createLevelsBatch } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface WizardLevel {
  id: string;
  name_ar: string;
  level_order: number;
}

interface WizardPosition {
  id: string;
  name_ar: string;
}

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * First-time setup wizard (2026-07-24): shown only when the org-structure
 * page has zero levels at all. Walks the caller through "كم عدد المستويات
 * المطلوبة" (how many levels are needed) then, level by level, guides
 * creating positions before landing on the normal builder page (which now
 * has real data to show, plus the tree visualization).
 *
 * Levels are created in one batch via `createLevelsBatch` (real ids
 * returned immediately); positions are then created one at a time via the
 * existing `addPosition` action, tracked in local state so the next level's
 * parent dropdown is available without a page reload between every step.
 * Only the final "finish" step calls `router.refresh()`, so the underlying
 * server page re-renders once with fully-populated data instead of
 * flickering through the wizard steps as the levels prop changes.
 */
export function OrgStructureSetupWizard() {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<"intro" | "count" | "positions">("intro");
  const [count, setCount] = useState(3);
  const [levels, setLevels] = useState<WizardLevel[]>([]);
  const [levelIndex, setLevelIndex] = useState(0);
  const [positionsByLevel, setPositionsByLevel] = useState<Record<string, WizardPosition[]>>({});

  const [posNameAr, setPosNameAr] = useState("");
  const [posNameEn, setPosNameEn] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const currentLevel = levels[levelIndex];
  const isRootLevel = levelIndex === 0;
  // Any level ABOVE the current one, not just the immediately preceding
  // one — matches the DB's own relaxed parent invariant (any ancestor,
  // skipping levels is fine, since 20260724000001) and the manual
  // AddOrgStructurePositionForm's equivalent fix. Closest level listed
  // first for convenience.
  const higherLevels = levels.slice(0, levelIndex).reverse();
  const parentOptions = higherLevels.flatMap((lvl) =>
    (positionsByLevel[lvl.id] ?? []).map((p) => ({ ...p, levelName: lvl.name_ar }))
  );
  const parentId = selectedParentId ?? parentOptions[0]?.id ?? "";
  const currentLevelPositions = currentLevel ? positionsByLevel[currentLevel.id] ?? [] : [];
  const isLastLevel = levelIndex === levels.length - 1;

  function handleCreateLevels(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createLevelsBatch(count);
      if (res.status === "success") {
        setLevels(res.levels);
        setLevelIndex(0);
        setStep("positions");
      } else {
        setError(res.message);
      }
    });
  }

  function handleAddPosition(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!currentLevel) return;
    startTransition(async () => {
      const res = await addPosition(currentLevel.id, posNameAr, posNameEn, isRootLevel ? undefined : parentId);
      if (res.status === "success") {
        setPositionsByLevel((prev) => ({
          ...prev,
          [currentLevel.id]: [...(prev[currentLevel.id] ?? []), { id: res.positionId, name_ar: posNameAr }],
        }));
        setPosNameAr("");
        setPosNameEn("");
      } else {
        setError(res.message);
      }
    });
  }

  function handleNextLevel() {
    setError(null);
    setSelectedParentId(null);
    setPosNameAr("");
    setPosNameEn("");
    setLevelIndex((i) => i + 1);
  }

  function handleFinish() {
    router.refresh();
  }

  if (step === "intro") {
    return (
      <div className="sru-card" style={{ padding: 28, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t("wizardEmptyTitle")}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 18 }}>{t("wizardEmptyDesc")}</p>
        <button type="button" onClick={() => setStep("count")} className="sru-btn sru-btn-primary">
          {t("wizardStartButton")}
        </button>
      </div>
    );
  }

  if (step === "count") {
    return (
      <form
        onSubmit={handleCreateLevels}
        className="sru-card"
        style={{ padding: 24, maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>{t("wizardCountTitle")}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("wizardCountDesc")}</p>
        <div>
          <label htmlFor="wizard-level-count" className="block text-sm font-medium mb-1">
            {t("wizardCountLabel")}
          </label>
          <input
            id="wizard-level-count"
            type="number" lang="en"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            required
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </p>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setStep("intro")} className="sru-btn">
            {t("wizardBackToIntro")}
          </button>
          <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary">
            {isPending ? t("wizardCreatingLevels") : t("wizardCountNext")}
          </button>
        </div>
      </form>
    );
  }

  if (!currentLevel) return null;

  return (
    <div className="sru-card" style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        {t("wizardLevelProgress", { current: levelIndex + 1, total: levels.length, name: currentLevel.name_ar })}
      </h2>

      <form onSubmit={handleAddPosition} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>{t("wizardAddPositionHeading")}</h3>
        {!isRootLevel && (
          <div>
            <label htmlFor="wizard-position-parent" className="block text-sm font-medium mb-1">
              {t("positionParentLabel")}
            </label>
            {parentOptions.length === 0 ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("noParentOptions")}</p>
            ) : (
              <select
                id="wizard-position-parent"
                value={parentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
                required
                className={inputClass}
              >
                {parentOptions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.levelName} — {position.name_ar}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div>
          <label htmlFor="wizard-position-name-ar" className="block text-sm font-medium mb-1">
            {t("positionNameArLabel")}
          </label>
          <input
            id="wizard-position-name-ar"
            value={posNameAr}
            onChange={(e) => setPosNameAr(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="wizard-position-name-en" className="block text-sm font-medium mb-1">
            {t("positionNameEnLabel")}
          </label>
          <input
            id="wizard-position-name-en"
            value={posNameEn}
            onChange={(e) => setPosNameEn(e.target.value)}
            dir="ltr"
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending || (!isRootLevel && parentOptions.length === 0)}
          className="sru-btn sru-btn-primary"
          style={{ alignSelf: "flex-start" }}
        >
          {t("wizardAddPositionButton")}
        </button>
      </form>

      <div style={{ marginTop: 18 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t("wizardPositionsAddedHeading")}</h4>
        {currentLevelPositions.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("wizardNoPositionsAddedYet")}</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {currentLevelPositions.map((p) => (
              <span key={p.id} className="sru-chip">
                {p.name_ar}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        {isLastLevel ? (
          <button type="button" disabled={isPending} onClick={handleFinish} className="sru-btn sru-btn-primary">
            {t("wizardFinishButton")}
          </button>
        ) : (
          <button type="button" disabled={isPending} onClick={handleNextLevel} className="sru-btn sru-btn-primary">
            {t("wizardNextLevelButton")}
          </button>
        )}
      </div>
    </div>
  );
}
