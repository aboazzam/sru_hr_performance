"use client";

import { useRef, useState, useTransition } from "react";
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

// Compact trigger button opening a <dialog> modal (2026-07-25 request: the
// always-visible full-width card took up too much page height for such an
// occasional action -- reuses the exact pattern already established by
// ImportOrgStructureExcelForm/AddOrgStructureLevelForm).
export function AddOrgStructurePositionForm({ levels, positions }: { levels: LevelOption[]; positions: PositionOption[] }) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  // `selectedLevelId`/`selectedParentId` are only ever set by the user
  // explicitly picking an option; the actual values used everywhere below
  // fall back to sensible defaults recomputed fresh on every render. This
  // avoids seeding useState directly from a prop-derived default (which
  // would go stale the moment that prop transitions from empty to
  // non-empty via router.refresh() — found live: `addPosition("", ...)`
  // silently failing validation because a stored "" never updated).
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const levelId = selectedLevelId ?? levels[0]?.id ?? "";
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const minLevelOrder = levels.length > 0 ? Math.min(...levels.map((l) => l.level_order)) : null;
  const selectedLevel = levels.find((l) => l.id === levelId);
  const isRootLevel = selectedLevel != null && selectedLevel.level_order === minLevelOrder;
  // Any level ABOVE the selected one (lower level_order), not just the
  // immediately preceding one — the DB itself allows linking a position to
  // any ancestor, skipping levels entirely (validate_org_structure_position_parent
  // only blocks a self-parent and cycles, since 20260724000001), so this
  // form offers every higher level's positions as parent candidates instead
  // of artificially restricting to one level up.
  const levelOrderById = new Map(levels.map((l) => [l.id, l.level_order]));
  const levelNameById = new Map(levels.map((l) => [l.id, l.name_ar]));
  const parentOptions = selectedLevel
    ? positions
        .filter((p) => (levelOrderById.get(p.level_id) ?? Infinity) < selectedLevel.level_order)
        .slice()
        .sort((a, b) => (levelOrderById.get(b.level_id) ?? 0) - (levelOrderById.get(a.level_id) ?? 0))
    : [];

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
        dialogRef.current?.close();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (levels.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn">
        {t("addPositionTriggerButton")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("addPositionHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
          {!isRootLevel && (
            <div>
              <label className="block text-sm font-medium mb-1">{t("positionParentLabel")}</label>
              {parentOptions.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("noParentOptions")}</p>
              ) : (
                <select value={parentId} onChange={(e) => setSelectedParentId(e.target.value)} required className={inputClass}>
                  {parentOptions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {levelNameById.get(position.level_id) ?? "—"} — {position.name_ar}
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
          <button
            type="submit"
            disabled={isPending || (!isRootLevel && parentOptions.length === 0)}
            className="sru-btn sru-btn-primary"
            style={{ alignSelf: "flex-start" }}
          >
            {t("addPositionButton")}
          </button>
        </form>
      </dialog>
    </>
  );
}
