"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { assignJobTitleCompetency, removeJobTitleCompetency } from "@/app/[locale]/(app)/career-path/job-titles/[id]/actions";
import { behavioralLevelLabels, type BehavioralLevel } from "@/lib/data/competencies";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateCompetency",
  unknown: "errorUnknown",
};

const levels: BehavioralLevel[] = ["basic", "practitioner", "advanced", "professional"];

interface AssignedRow {
  id: string;
  competencyId: string;
  nameAr: string;
  requiredLevel: BehavioralLevel;
}

interface CompetencyOption {
  id: string;
  nameAr: string;
  pillarAr: string;
}

export function JobTitleCompetenciesManager({
  jobTitleId,
  assigned,
  allCompetencies,
  canEdit,
}: {
  jobTitleId: string;
  assigned: AssignedRow[];
  allCompetencies: CompetencyOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assignedCompetencyIds = new Set(assigned.map((a) => a.competencyId));
  const availableOptions = allCompetencies.filter((c) => !assignedCompetencyIds.has(c.id));

  const byPillar = new Map<string, CompetencyOption[]>();
  for (const opt of availableOptions) {
    const list = byPillar.get(opt.pillarAr);
    if (list) list.push(opt);
    else byPillar.set(opt.pillarAr, [opt]);
  }

  const [selectedCompetencyId, setSelectedCompetencyId] = useState<string | null>(null);
  const competencyId = selectedCompetencyId ?? availableOptions[0]?.id ?? "";
  const [requiredLevel, setRequiredLevel] = useState<BehavioralLevel>("basic");

  function handleAdd() {
    if (!competencyId) return;
    setError(null);
    startTransition(async () => {
      const res = await assignJobTitleCompetency(jobTitleId, competencyId, requiredLevel);
      if (res.status === "success") {
        setSelectedCompetencyId(null);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleRemove(requirementId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeJobTitleCompetency(requirementId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div>
      {assigned.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 16 }}>{t("noCompetenciesYet")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
          {assigned.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid var(--sru-border)",
              }}
            >
              <span style={{ flex: 1 }}>{row.nameAr}</span>
              <span className="sru-chip">{behavioralLevelLabels[row.requiredLevel]}</span>
              {canEdit && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleRemove(row.id)}
                  className="sru-icon-action danger"
                  title={t("removeCompetency")}
                  aria-label={t("removeCompetency")}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && availableOptions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="block text-sm font-medium mb-1">{t("competencyLabel")}</label>
            <select
              value={competencyId}
              onChange={(e) => setSelectedCompetencyId(e.target.value)}
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
          <div>
            <label className="block text-sm font-medium mb-1">{t("requiredLevelLabel")}</label>
            <select
              value={requiredLevel}
              onChange={(e) => setRequiredLevel(e.target.value as BehavioralLevel)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {behavioralLevelLabels[level]}
                </option>
              ))}
            </select>
          </div>
          <button type="button" disabled={isPending} onClick={handleAdd} className="sru-btn sru-btn-primary">
            {isPending ? t("adding") : t("addCompetency")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
