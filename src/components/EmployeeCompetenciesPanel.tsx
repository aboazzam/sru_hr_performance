"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, Award } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AddFormDialog } from "@/components/AddFormDialog";
import {
  setEmployeeCompetencyLevel,
  removeEmployeeCompetency,
} from "@/app/[locale]/(app)/employees/[id]/tab-actions";
import { behavioralLevelLabels, type BehavioralLevel } from "@/lib/data/competencies";

const levels: BehavioralLevel[] = ["basic", "practitioner", "advanced", "professional"];

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export interface EmployeeCompetencyOption {
  id: string;
  nameAr: string;
  pillarAr: string;
  isCore: boolean;
}

export interface AssignedEmployeeCompetency {
  id: string;
  competencyId: string;
  requiredLevel: BehavioralLevel;
}

/** One competency row: a level picker when unset, level + remove when set. */
function CompetencyRow({
  employeeId,
  option,
  assigned,
  canEdit,
}: {
  employeeId: string;
  option: EmployeeCompetencyOption;
  assigned: AssignedEmployeeCompetency | undefined;
  canEdit: boolean;
}) {
  const t = useTranslations("EmployeeCompetenciesTab");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ status: string; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") router.refresh();
      else setError(result.message ?? "unknown");
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
      <span style={{ flex: 1 }}>{option.nameAr}</span>
      {canEdit ? (
        <select
          value={assigned?.requiredLevel ?? ""}
          disabled={pending}
          onChange={(event) =>
            run(() => setEmployeeCompetencyLevel(employeeId, option.id, event.target.value))
          }
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
        <span className="sru-chip" style={assigned ? undefined : { color: "var(--sru-muted)" }}>
          {assigned ? behavioralLevelLabels[assigned.requiredLevel] : t("levelNotSet")}
        </span>
      )}
      {assigned && canEdit ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => removeEmployeeCompetency(assigned.id))}
          className="sru-icon-action danger"
          title={t("removeCompetency")}
          aria-label={t("removeCompetency")}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 10.5, color: "#b91c1c" }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The employee's own competencies: every institutional (core) competency is
 * always listed so a level can be set for each, and anything else is added
 * deliberately.
 *
 * This is the PERSON's record, not the job title's. job_title_competencies
 * describes a title and is shared by everyone holding it, so a level set
 * there would silently move for colleagues too.
 */
export function EmployeeCompetenciesPanel({
  employeeId,
  options,
  assigned,
  canEdit,
}: {
  employeeId: string;
  options: EmployeeCompetencyOption[];
  assigned: AssignedEmployeeCompetency[];
  canEdit: boolean;
}) {
  const t = useTranslations("EmployeeCompetenciesTab");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const [pickedLevel, setPickedLevel] = useState<BehavioralLevel>("basic");

  const assignedById = new Map(assigned.map((row) => [row.competencyId, row]));
  const core = options.filter((option) => option.isCore);
  const extra = options.filter((option) => !option.isCore && assignedById.has(option.id));
  const addable = options.filter((option) => !option.isCore && !assignedById.has(option.id));

  const byPillar = new Map<string, EmployeeCompetencyOption[]>();
  for (const option of addable) {
    const list = byPillar.get(option.pillarAr) ?? [];
    list.push(option);
    byPillar.set(option.pillarAr, list);
  }

  function add() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      const result = await setEmployeeCompetencyLevel(employeeId, picked, pickedLevel);
      if (result.status === "success") {
        setPicked("");
        dialogRef.current?.close();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 14 }}>{t("note")}</p>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>{t("coreHeading")}</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px" }}>
        {core.map((option) => (
          <CompetencyRow
            key={option.id}
            employeeId={employeeId}
            option={option}
            assigned={assignedById.get(option.id)}
            canEdit={canEdit}
          />
        ))}
      </ul>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>{t("otherHeading")}</h3>
        {canEdit ? (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addCompetency")}
            heading={t("addCompetency")}
            subtitle={t("addSubtitle")}
            closeLabel={t("closeButton")}
          >
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="employee-competency-pick">{t("competencyLabel")}</label>
              <select
                id="employee-competency-pick"
                value={picked}
                onChange={(event) => setPicked(event.target.value)}
              >
                <option value="">{t("competencyPlaceholder")}</option>
                {[...byPillar.entries()].map(([pillar, list]) => (
                  <optgroup key={pillar} label={pillar}>
                    {list.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.nameAr}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="employee-competency-level">{t("levelLabel")}</label>
              <select
                id="employee-competency-level"
                value={pickedLevel}
                onChange={(event) => setPickedLevel(event.target.value as BehavioralLevel)}
              >
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {behavioralLevelLabels[level]}
                  </option>
                ))}
              </select>
            </div>
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                {t(errorMessageKeys[error] ?? "errorUnknown")}
              </p>
            ) : null}
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-slim"
              disabled={!picked || pending}
              onClick={add}
            >
              <Award size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
              {t("addCompetency")}
            </button>
          </AddFormDialog>
        ) : null}
      </div>
      {extra.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 8 }}>{t("otherEmpty")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
          {extra.map((option) => (
            <CompetencyRow
              key={option.id}
              employeeId={employeeId}
              option={option}
              assigned={assignedById.get(option.id)}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
