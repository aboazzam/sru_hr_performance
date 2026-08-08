"use client";

import { behavioralLevelLabels, type BehavioralLevel } from "@/lib/data/competencies";

export interface CompetencyOption {
  id: string;
  name_ar: string;
  type?: string;
}

/** A competency the request asks for, together with how well it must be held. */
export interface SelectedCompetency {
  competencyId: string;
  requiredLevel: BehavioralLevel;
}

/**
 * The same pair while a form is still being filled in, where a level the
 * requester has not chosen yet is a real, representable state ("") rather
 * than a lie about a level that exists. Only fully-levelled rows are saved.
 */
export interface CompetencyDraft {
  competencyId: string;
  requiredLevel: BehavioralLevel | "";
}

/** The framework's four levels, in order. Same source as every other level picker in this app. */
export const levelOrder: BehavioralLevel[] = ["basic", "practitioner", "advanced", "professional"];

/** How many ticked competencies still have no level — the value that blocks saving. */
export function countMissingLevels(selection: CompetencyDraft[]): number {
  return selection.filter((entry) => !entry.requiredLevel).length;
}

/**
 * Narrows a draft to the fully-levelled shape the Server Actions accept.
 * Callers block saving while `countMissingLevels` is non-zero, so this drops
 * nothing in practice — it is what removes the need for a cast.
 */
export function toSavedCompetencies(selection: CompetencyDraft[]): SelectedCompetency[] {
  return selection.flatMap((entry) =>
    entry.requiredLevel
      ? [{ competencyId: entry.competencyId, requiredLevel: entry.requiredLevel }]
      : []
  );
}

/** Compares the pair, not just the ids — a changed LEVEL counts as a change. */
export function sameSelection(a: CompetencyDraft[], b: CompetencyDraft[]): boolean {
  const key = (list: CompetencyDraft[]) =>
    [...list]
      .map((entry) => `${entry.competencyId}:${entry.requiredLevel}`)
      .sort()
      .join("|");
  return key(a) === key(b);
}

/**
 * Pick competencies and, for each one picked, the level it must be held at.
 *
 * Shared by the create form and the inline row editor so the two cannot
 * drift: this project has already been bitten by a fix landing in only one
 * of two places that both needed it.
 *
 * Ticking a competency deliberately leaves its level unchosen rather than
 * defaulting it — guessing a level nobody decided is exactly the failure
 * this whole feature exists to end — and the caller keeps saving blocked
 * until `countMissingLevels` reaches zero.
 */
export function CompetencyLevelPicker({
  competencies,
  selection,
  onChange,
  labels,
  disabled = false,
}: {
  competencies: CompetencyOption[];
  selection: CompetencyDraft[];
  onChange: (next: CompetencyDraft[]) => void;
  labels: {
    levelPlaceholder: string;
    /** Accessible name for one competency's level select, e.g. "المستوى المطلوب لجدارة X". */
    levelFor: (name: string) => string;
  };
  disabled?: boolean;
}) {
  function toggle(id: string) {
    onChange(
      selection.some((entry) => entry.competencyId === id)
        ? selection.filter((entry) => entry.competencyId !== id)
        : [...selection, { competencyId: id, requiredLevel: "" as const }]
    );
  }

  function setLevel(id: string, level: BehavioralLevel) {
    onChange(
      selection.map((entry) =>
        entry.competencyId === id ? { ...entry, requiredLevel: level } : entry
      )
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 8,
      }}
    >
      {competencies.map((competency) => {
        const entry = selection.find((item) => item.competencyId === competency.id);
        return (
          <div
            key={competency.id}
            style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}
          >
            <label style={{ display: "flex", gap: 6 }}>
              <input
                type="checkbox"
                checked={Boolean(entry)}
                disabled={disabled}
                onChange={() => toggle(competency.id)}
              />
              <span>{competency.name_ar}</span>
            </label>
            {/* The level appears only once the competency is asked for: a
                level on an unticked row would be a setting with no subject,
                and it keeps the unselected grid quiet. */}
            {entry && (
              <select
                aria-label={labels.levelFor(competency.name_ar)}
                value={entry.requiredLevel}
                disabled={disabled}
                onChange={(event) => setLevel(competency.id, event.target.value as BehavioralLevel)}
                style={{ fontSize: 12, marginInlineStart: 22 }}
              >
                <option value="" disabled>
                  {labels.levelPlaceholder}
                </option>
                {levelOrder.map((option) => (
                  <option key={option} value={option}>
                    {behavioralLevelLabels[option]}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
