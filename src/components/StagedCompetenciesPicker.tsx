"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { behavioralLevelLabels, type BehavioralLevel } from "@/lib/data/competencies";

export interface StagedCompetency {
  competencyId: string;
  nameAr: string;
  requiredLevel: BehavioralLevel | "";
}

interface CompetencyOption {
  id: string;
  nameAr: string;
  pillarAr: string;
}

const levels: BehavioralLevel[] = ["basic", "practitioner", "advanced", "professional"];

/**
 * "Unsaved" competency picker for the create-job-title flow — the job
 * itself doesn't exist yet, so nothing here writes to the database; the
 * parent form submits the final `value` array as part of createJobTitle.
 * Starts pre-populated with the institutional (type='core') competencies,
 * each with an empty requiredLevel forcing an explicit choice (per the
 * project owner's "وينتظرك تحدد المستوى السلوكي" instruction) — createJobTitle
 * rejects the submission server-side too if any row is missing a level.
 */
export function StagedCompetenciesPicker({
  value,
  onChange,
  allCompetencies,
}: {
  value: StagedCompetency[];
  onChange: (next: StagedCompetency[]) => void;
  allCompetencies: CompetencyOption[];
}) {
  const t = useTranslations("CareerPathNewJobTitlePage");

  const stagedIds = new Set(value.map((v) => v.competencyId));
  const available = allCompetencies.filter((c) => !stagedIds.has(c.id));
  const byPillar = new Map<string, CompetencyOption[]>();
  for (const opt of available) {
    const list = byPillar.get(opt.pillarAr);
    if (list) list.push(opt);
    else byPillar.set(opt.pillarAr, [opt]);
  }
  const [selectedToAdd, setSelectedToAdd] = useState(available[0]?.id ?? "");
  const effectiveSelectedToAdd = available.some((o) => o.id === selectedToAdd) ? selectedToAdd : available[0]?.id ?? "";

  function updateLevel(competencyId: string, level: BehavioralLevel | "") {
    onChange(value.map((v) => (v.competencyId === competencyId ? { ...v, requiredLevel: level } : v)));
  }
  function removeRow(competencyId: string) {
    onChange(value.filter((v) => v.competencyId !== competencyId));
  }
  function addFromLibrary() {
    const opt = allCompetencies.find((c) => c.id === effectiveSelectedToAdd);
    if (!opt) return;
    onChange([...value, { competencyId: opt.id, nameAr: opt.nameAr, requiredLevel: "" }]);
    setSelectedToAdd("");
  }

  return (
    <div>
      {value.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 16 }}>{t("noCompetenciesStaged")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
          {value.map((row) => (
            <li
              key={row.competencyId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid var(--sru-border)",
              }}
            >
              <span style={{ flex: 1 }}>{row.nameAr}</span>
              <select
                value={row.requiredLevel}
                onChange={(e) => updateLevel(row.competencyId, e.target.value as BehavioralLevel)}
                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)]"
              >
                <option value="" disabled>
                  {t("selectLevelPlaceholder")}
                </option>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {behavioralLevelLabels[l]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(row.competencyId)}
                className="sru-icon-action danger"
                title={t("removeCompetency")}
                aria-label={t("removeCompetency")}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("competencyLabel")}</label>
            <select
              value={effectiveSelectedToAdd}
              onChange={(e) => setSelectedToAdd(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
            >
              {[...byPillar.entries()].map(([pillar, opts]) => (
                <optgroup key={pillar} label={pillar}>
                  {opts.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nameAr}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button type="button" onClick={addFromLibrary} className="sru-btn">
            {t("addCompetency")}
          </button>
        </div>
      )}
    </div>
  );
}
