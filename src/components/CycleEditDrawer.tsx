"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { X, Pencil } from "lucide-react";
import {
  updateCycleMethodWeights,
  updateEvaluationCycle,
  type EvaluationCycleActionState,
} from "@/app/[locale]/(app)/evaluations/cycles/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { WeightGroupFields, methodLabelKeys } from "@/components/WeightGroupFields";
import { evaluationMethods, isValidWeights, type MethodWeights } from "@/lib/evaluationCycle";

const errorKeys: Record<string, string> = {
  invalid_input: "weightsErrorInvalid",
  unauthenticated: "manageErrorUnauthenticated",
  forbidden: "weightsErrorForbidden",
  has_dependents: "weightsErrorUnknown",
  unknown: "weightsErrorUnknown",
};

const cycleTypes = ["academic", "calendar", "fiscal"] as const;

const cycleTypeLabelKeys: Record<string, string> = {
  academic: "cycleTypeAcademic",
  calendar: "cycleTypeCalendar",
  fiscal: "cycleTypeFiscal",
};

export interface CycleEditDrawerCycle {
  id: string;
  nameAr: string;
  nameEn: string | null;
  cycleType: string;
  startDate: string;
  endDate: string;
  weights: MethodWeights;
}

/**
 * One panel for everything about a cycle: its own details and its method
 * weights.
 *
 * The weights already lived here; the cycle's details were editable only in
 * the table row itself, which meant editing a name pushed date pickers into
 * narrow cells and shoved every other column aside. Both now happen in the
 * same place, and one Save writes whichever of the two actually changed.
 *
 * Built on <dialog> for the backdrop and the modal focus trap; the drawer
 * look is CSS on top (.sru-drawer), not a hand-rolled overlay. Escape is
 * wired by hand below -- it was measured NOT closing this dialog on its own.
 */
export function CycleEditDrawer({
  cycle,
  canEdit,
  typeLabels,
}: {
  cycle: CycleEditDrawerCycle;
  canEdit: boolean;
  typeLabels: Record<string, string>;
}) {
  const t = useTranslations("EvaluationCyclesPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [saved, setSaved] = useState<CycleEditDrawerCycle>(cycle);
  const [nameAr, setNameAr] = useState(cycle.nameAr);
  const [nameEn, setNameEn] = useState(cycle.nameEn ?? "");
  const [cycleType, setCycleType] = useState(cycle.cycleType);
  const [startDate, setStartDate] = useState(cycle.startDate);
  const [endDate, setEndDate] = useState(cycle.endDate);
  const [weights, setWeights] = useState<MethodWeights>(cycle.weights);

  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A save elsewhere (the cycle's own screen) re-renders this row with new
  // props; adopt them rather than keeping a stale baseline that would make
  // Save look enabled for a change already stored.
  const [adopted, setAdopted] = useState(cycle);
  if (
    adopted.nameAr !== cycle.nameAr ||
    adopted.nameEn !== cycle.nameEn ||
    adopted.cycleType !== cycle.cycleType ||
    adopted.startDate !== cycle.startDate ||
    adopted.endDate !== cycle.endDate ||
    adopted.weights.activities !== cycle.weights.activities ||
    adopted.weights.competencies !== cycle.weights.competencies ||
    adopted.weights.bau !== cycle.weights.bau ||
    adopted.weights.feedback360 !== cycle.weights.feedback360
  ) {
    setAdopted(cycle);
    setSaved(cycle);
    setNameAr(cycle.nameAr);
    setNameEn(cycle.nameEn ?? "");
    setCycleType(cycle.cycleType);
    setStartDate(cycle.startDate);
    setEndDate(cycle.endDate);
    setWeights(cycle.weights);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setStatus("idle");
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const weightsValid = isValidWeights(weights);
  const datesValid = startDate !== "" && endDate !== "" && endDate > startDate;

  const detailsDirty =
    nameAr !== saved.nameAr ||
    nameEn !== (saved.nameEn ?? "") ||
    cycleType !== saved.cycleType ||
    startDate !== saved.startDate ||
    endDate !== saved.endDate;
  const weightsDirty = evaluationMethods.some(
    (method) => Number(weights[method]) !== Number(saved.weights[method])
  );

  const summary = evaluationMethods.map((method) => `${saved.weights[method]}%`).join(" / ");
  const title = evaluationMethods
    .map((method) => `${t(methodLabelKeys[method])}: ${saved.weights[method]}%`)
    .join("، ");

  function open() {
    setNameAr(saved.nameAr);
    setNameEn(saved.nameEn ?? "");
    setCycleType(saved.cycleType);
    setStartDate(saved.startDate);
    setEndDate(saved.endDate);
    setWeights(saved.weights);
    setStatus("idle");
    setErrorCode(null);
    dialogRef.current?.showModal();
  }

  function save() {
    setStatus("idle");
    setErrorCode(null);
    startTransition(async () => {
      // Only what actually changed is written, so saving a renamed cycle does
      // not also rewrite its weights (and vice versa) — and the audit log
      // records the one real change rather than two.
      let result: EvaluationCycleActionState = { status: "success" };

      if (detailsDirty) {
        result = await updateEvaluationCycle({
          cycleId: cycle.id,
          nameAr,
          nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
          cycleType,
          startDate,
          endDate,
        });
      }

      if (result.status === "success" && weightsDirty) {
        result = await updateCycleMethodWeights({
          cycleId: cycle.id,
          activities: Number(weights.activities),
          competencies: Number(weights.competencies),
          bau: Number(weights.bau),
          feedback360: Number(weights.feedback360),
        });
      }

      if (result.status === "success") {
        const next: CycleEditDrawerCycle = {
          id: cycle.id,
          nameAr,
          nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
          cycleType,
          startDate,
          endDate,
          weights,
        };
        setSaved(next);
        setAdopted(next);
        setStatus("saved");
        router.refresh();
      } else {
        setErrorCode(result.message);
        setStatus("error");
      }
    });
  }

  if (!canEdit) {
    return (
      <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }} title={title}>
        {summary}
      </span>
    );
  }

  const canSave = (detailsDirty || weightsDirty) && weightsValid && datesValid && !pending;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="sru-weights-trigger"
        title={t("cycleEditTitle")}
        aria-label={t("cycleEditTitle")}
      >
        <Pencil size={12} aria-hidden style={{ marginInlineEnd: 5, verticalAlign: "-1px" }} />
        {summary}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-drawer"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dialogRef.current?.close();
          }
        }}
      >
        <div className="sru-drawer-head">
          <div>
            <h2>{t("cycleDrawerTitle")}</h2>
            <p>{saved.nameAr}</p>
          </div>
          <button
            type="button"
            className="sru-icon-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("closeButton")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="sru-drawer-body">
          <h3 style={{ fontSize: 13, margin: "0 0 10px" }}>{t("cycleDetailsHeading")}</h3>

          <div className="sru-field" style={{ marginBottom: 12 }}>
            <label htmlFor={`drawer-${cycle.id}-nameAr`}>{t("columnName")}</label>
            <input
              id={`drawer-${cycle.id}-nameAr`}
              value={nameAr}
              disabled={pending}
              onChange={(event) => setNameAr(event.target.value)}
            />
          </div>

          <div className="sru-field" style={{ marginBottom: 12 }}>
            <label htmlFor={`drawer-${cycle.id}-nameEn`}>{t("cycleNameEnLabel")}</label>
            <input
              id={`drawer-${cycle.id}-nameEn`}
              value={nameEn}
              dir="ltr"
              disabled={pending}
              onChange={(event) => setNameEn(event.target.value)}
            />
          </div>

          <div className="sru-field" style={{ marginBottom: 12 }}>
            <label htmlFor={`drawer-${cycle.id}-type`}>{t("columnType")}</label>
            <select
              id={`drawer-${cycle.id}-type`}
              value={cycleType}
              disabled={pending}
              onChange={(event) => setCycleType(event.target.value)}
            >
              {cycleTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[cycleTypeLabelKeys[type]]}
                </option>
              ))}
            </select>
          </div>

          <div className="sru-field" style={{ marginBottom: 12 }}>
            <label>{t("columnStartDate")}</label>
            <DateFieldDmy
              value={startDate}
              onChange={setStartDate}
              disabled={pending}
              ariaLabel={t("columnStartDate")}
            />
          </div>

          <div className="sru-field" style={{ marginBottom: 12 }}>
            <label>{t("columnEndDate")}</label>
            <DateFieldDmy
              value={endDate}
              onChange={setEndDate}
              disabled={pending}
              ariaLabel={t("columnEndDate")}
            />
          </div>

          {!datesValid ? (
            <p style={{ color: "#b91c1c", fontSize: 12, marginTop: -4, marginBottom: 12 }}>
              {t("cycleDatesInvalid")}
            </p>
          ) : null}

          <hr style={{ border: 0, borderTop: "1px solid var(--sru-border)", margin: "18px 0" }} />

          <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>{t("weightsDrawerTitle")}</h3>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 16 }}>{t("weightsDrawerNote")}</p>

          <WeightGroupFields
            idPrefix={`drawer-${cycle.id}`}
            values={weights}
            onChange={setWeights}
            disabled={pending}
          />

          {status === "saved" ? (
            <p style={{ color: "var(--sru-success, #1f9d55)", fontSize: 12, marginTop: 8 }}>
              {t("cycleSaved")}
            </p>
          ) : null}
          {status === "error" ? (
            <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>
              {t(errorKeys[errorCode ?? "unknown"] ?? "weightsErrorUnknown")}
            </p>
          ) : null}
        </div>

        <div className="sru-drawer-foot">
          <button type="button" className="sru-btn sru-btn-primary" disabled={!canSave} onClick={save}>
            {pending ? t("weightsSaving") : t("cycleSave")}
          </button>
          <button type="button" className="sru-btn" onClick={() => dialogRef.current?.close()}>
            {t("closeButton")}
          </button>
        </div>
      </dialog>
    </>
  );
}
