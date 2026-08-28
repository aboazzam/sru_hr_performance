"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, Award } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AddFormDialog } from "@/components/AddFormDialog";
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
  pillarAr: string;
  requiredLevel: BehavioralLevel;
}

interface CompetencyOption {
  id: string;
  nameAr: string;
  pillarAr: string;
}

/** One row of the "الجدارات المؤسسية" list -- either already assigned (shows
 * its level + a delete icon) or still pending (shows a level picker that
 * assigns the moment a level is chosen, no separate "add" click). */
function CoreCompetencyRow({
  jobTitleId,
  competencyId,
  nameAr,
  assignedRow,
  canEdit,
}: {
  jobTitleId: string;
  competencyId: string;
  nameAr: string;
  assignedRow: AssignedRow | undefined;
  canEdit: boolean;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSetLevel(level: BehavioralLevel) {
    setError(null);
    startTransition(async () => {
      const res = await assignJobTitleCompetency(jobTitleId, competencyId, level);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  function handleRemove() {
    if (!assignedRow) return;
    setError(null);
    startTransition(async () => {
      const res = await removeJobTitleCompetency(assignedRow.id);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--sru-border)",
      }}
    >
      <span style={{ flex: 1 }}>{nameAr}</span>
      {assignedRow ? (
        <>
          <span className="sru-chip">{behavioralLevelLabels[assignedRow.requiredLevel]}</span>
          {canEdit && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleRemove}
              className="sru-icon-action danger"
              title={t("removeCompetency")}
              aria-label={t("removeCompetency")}
            >
              <Trash2 size={14} />
            </button>
          )}
        </>
      ) : canEdit ? (
        <select
          value=""
          disabled={isPending}
          onChange={(e) => handleSetLevel(e.target.value as BehavioralLevel)}
          style={{ fontSize: 12 }}
        >
          <option value="" disabled>
            {t("selectLevelPlaceholder")}
          </option>
          {levels.map((level) => (
            <option key={level} value={level}>
              {behavioralLevelLabels[level]}
            </option>
          ))}
        </select>
      ) : (
        <span className="sru-chip" style={{ color: "var(--sru-muted)" }}>
          {t("coreLevelNotSet")}
        </span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: 10.5, color: "#b91c1c" }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      )}
    </li>
  );
}

// "الجدارات الأساسية تظهر بشكل تلقائي والمطلوب مني تحديد المستوى وإضافة
// الجدارات الاخرى مثل التخصصية" (2026-08-03): institutional (classification
// flagged auto_apply_everywhere, 20260829000001, was hardcoded to type='core')
// competencies are common to every job title, so they're now always listed
// here regardless of whether they've been assigned yet -- picking a level
// for a not-yet-assigned one assigns it immediately (CoreCompetencyRow
// above), instead of requiring the admin to find and add all ~11 of them one
// at a time through the same dropdown used for specialized ones. The ADD
// dropdown below is scoped to specialized competencies only now, since core
// ones are always already listed above.
export function JobTitleCompetenciesManager({
  jobTitleId,
  assigned,
  coreCompetencies,
  allCompetencies,
  canEdit,
}: {
  jobTitleId: string;
  assigned: AssignedRow[];
  coreCompetencies: CompetencyOption[];
  allCompetencies: CompetencyOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assignedByCompetencyId = new Map(assigned.map((a) => [a.competencyId, a]));
  const coreIds = new Set(coreCompetencies.map((c) => c.id));

  // "الجدارات التخصصية" -- assigned rows that are NOT core, grouped by
  // pillar (2026-08-02 "ضع الجدارات حسب التصنيف"), sorted alphabetically for
  // a stable order (no display_order column on competency_pillars).
  const specializedAssigned = assigned.filter((row) => !coreIds.has(row.competencyId));
  const specializedByPillar = new Map<string, AssignedRow[]>();
  for (const row of specializedAssigned) {
    const list = specializedByPillar.get(row.pillarAr);
    if (list) list.push(row);
    else specializedByPillar.set(row.pillarAr, [row]);
  }
  const sortedPillars = [...specializedByPillar.keys()].sort((a, b) => a.localeCompare(b, "ar"));

  // ADD dropdown: specialized competencies only, not yet assigned -- core
  // ones are always already listed above and never belong in this dropdown.
  const assignedCompetencyIds = new Set(assigned.map((a) => a.competencyId));
  const availableOptions = allCompetencies.filter((c) => !coreIds.has(c.id) && !assignedCompetencyIds.has(c.id));
  const byPillar = new Map<string, CompetencyOption[]>();
  for (const opt of availableOptions) {
    const list = byPillar.get(opt.pillarAr);
    if (list) list.push(opt);
    else byPillar.set(opt.pillarAr, [opt]);
  }

  const [selectedCompetencyId, setSelectedCompetencyId] = useState<string | null>(null);
  const competencyId = selectedCompetencyId ?? availableOptions[0]?.id ?? "";
  const [requiredLevel, setRequiredLevel] = useState<BehavioralLevel>("basic");

  const dialogRef = useRef<HTMLDialogElement>(null);

  function handleAdd() {
    if (!competencyId) return;
    setError(null);
    startTransition(async () => {
      const res = await assignJobTitleCompetency(jobTitleId, competencyId, requiredLevel);
      if (res.status === "success") {
        // Closed only on success: an error keeps the dialog open with its
        // message inside it.
        dialogRef.current?.close();
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

  const addCompetencyForm = (
        <div className="sru-formgrid">
          <div className="sru-field">
            <label className="block text-sm font-medium mb-1">{t("competencyLabel")}</label>
            <select
              value={competencyId}
              onChange={(e) => setSelectedCompetencyId(e.target.value)}
              className="px-3 py-2 border border-[var(--border)] bg-[var(--background)]"
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
              className="px-3 py-2 border border-[var(--border)] bg-[var(--background)]"
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
  );

  return (
    <section className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Award size={17} aria-hidden />
        </span>
        <div style={{ flex: 1 }}>
          <h3>{t("competenciesHeading")}</h3>
          <span>{t("competenciesSubtitle")}</span>
        </div>
        {canEdit && availableOptions.length > 0 && (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addCompetency")}
            heading={t("addCompetency")}
            closeLabel={t("closeButton")}
          >
            {addCompetencyForm}
          </AddFormDialog>
        )}
      </div>

      <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--sru-blue)", margin: "0 0 4px" }}>{t("coreCompetenciesHeading")}</h4>
      <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginBottom: 8 }}>{t("coreCompetenciesNote")}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px" }}>
        {coreCompetencies.map((c) => (
          <CoreCompetencyRow
            key={c.id}
            jobTitleId={jobTitleId}
            competencyId={c.id}
            nameAr={c.nameAr}
            assignedRow={assignedByCompetencyId.get(c.id)}
            canEdit={canEdit}
          />
        ))}
      </ul>

      <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--sru-blue)", margin: "0 0 4px" }}>{t("specializedCompetenciesHeading")}</h4>
      {specializedAssigned.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 16 }}>{t("noCompetenciesYet")}</p>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {sortedPillars.map((pillar) => (
            <div key={pillar} style={{ marginBottom: 12 }}>
              <h5 style={{ fontSize: 11.5, fontWeight: 700, margin: "0 0 4px" }}>{pillar}</h5>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {specializedByPillar.get(pillar)!.map((row) => (
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
            </div>
          ))}
        </div>
      )}


      {error && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </section>
  );
}
