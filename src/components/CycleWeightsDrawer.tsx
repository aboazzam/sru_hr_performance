"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { X } from "lucide-react";
import { updateCycleMethodWeights } from "@/app/[locale]/(app)/evaluations/cycles/actions";
import {
  evaluationMethods,
  isValidWeights,
  weightsTotal,
  type EvaluationMethod,
  type MethodWeights,
} from "@/lib/evaluationCycle";

const errorKeys: Record<string, string> = {
  invalid_input: "weightsErrorInvalid",
  unauthenticated: "manageErrorUnauthenticated",
  forbidden: "weightsErrorForbidden",
  has_dependents: "weightsErrorUnknown",
  unknown: "weightsErrorUnknown",
};

const labelKeys: Record<EvaluationMethod, string> = {
  goals: "weightGoalsShort",
  competencies: "weightCompetenciesShort",
  bau: "weightBauShort",
  feedback360: "weightFeedback360Short",
};

/**
 * The cycle's method weights, edited from the list itself.
 *
 * A side drawer rather than an inline cell: four numbers that must total
 * exactly 100 need to be seen together while being changed, which a table
 * cell cannot give without pushing every other column out of the way.
 *
 * Built on <dialog> for the backdrop and the modal focus trap; the drawer
 * look is CSS on top (.sru-drawer), not a hand-rolled overlay. Escape is
 * wired by hand below -- it was measured NOT closing this dialog on its own.
 */
export function CycleWeightsDrawer({
  cycleId,
  cycleName,
  initial,
  canEdit,
}: {
  cycleId: string;
  cycleName: string;
  initial: MethodWeights;
  canEdit: boolean;
}) {
  const t = useTranslations("EvaluationCyclesPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState<MethodWeights>(initial);
  const [values, setValues] = useState<MethodWeights>(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A save elsewhere (the cycle's own screen) re-renders this row with new
  // props; adopt them rather than keeping a stale baseline that would make
  // Save look enabled for a change already stored.
  const [adopted, setAdopted] = useState(initial);
  if (
    adopted.goals !== initial.goals ||
    adopted.competencies !== initial.competencies ||
    adopted.bau !== initial.bau ||
    adopted.feedback360 !== initial.feedback360
  ) {
    setAdopted(initial);
    setSaved(initial);
    setValues(initial);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setStatus("idle");
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const total = weightsTotal(values);
  const valid = isValidWeights(values);
  const dirty = evaluationMethods.some((method) => Number(values[method]) !== Number(saved[method]));
  const summary = evaluationMethods.map((method) => `${saved[method]}%`).join(" / ");
  const title = evaluationMethods.map((method) => `${t(labelKeys[method])}: ${saved[method]}%`).join("، ");

  function open() {
    setValues(saved);
    setStatus("idle");
    setErrorCode(null);
    dialogRef.current?.showModal();
  }

  function save() {
    setStatus("idle");
    setErrorCode(null);
    startTransition(async () => {
      const result = await updateCycleMethodWeights({
        cycleId,
        goals: Number(values.goals),
        competencies: Number(values.competencies),
        bau: Number(values.bau),
        feedback360: Number(values.feedback360),
      });
      if (result.status === "success") {
        setSaved(values);
        setAdopted(values);
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

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="sru-weights-trigger"
        title={t("weightsEditTitle")}
        aria-label={t("weightsEditTitle")}
      >
        {summary}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-drawer"
        // Escape is handled explicitly rather than left to the browser: it was
        // measured NOT closing this dialog even with focus inside it, so the
        // key is wired here instead of assumed.
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dialogRef.current?.close();
          }
        }}
      >
        <div className="sru-drawer-head">
          <div>
            <h2>{t("weightsDrawerTitle")}</h2>
            <p>{cycleName}</p>
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
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 16 }}>{t("weightsDrawerNote")}</p>

          {evaluationMethods.map((method) => (
            <div className="sru-field" key={method} style={{ marginBottom: 12 }}>
              <label htmlFor={`drawer-${cycleId}-${method}`}>{t(labelKeys[method])}</label>
              <input
                id={`drawer-${cycleId}-${method}`}
                type="number"
                min={0}
                max={100}
                step={1}
                dir="ltr"
                disabled={pending}
                value={values[method]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [method]: Number(event.target.value) }))
                }
              />
            </div>
          ))}

          <p style={{ fontSize: 12.5, color: valid ? "var(--sru-muted)" : "#b91c1c", marginTop: 4 }}>
            {t("weightsTotalLabel")}: <strong>{total}%</strong>
            {valid ? "" : ` — ${t("weightsInvalid")}`}
          </p>

          {status === "saved" ? (
            <p style={{ color: "var(--sru-success, #1f9d55)", fontSize: 12, marginTop: 8 }}>
              {t("weightsSaved")}
            </p>
          ) : null}
          {status === "error" ? (
            <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>
              {t(errorKeys[errorCode ?? "unknown"] ?? "weightsErrorUnknown")}
            </p>
          ) : null}
        </div>

        <div className="sru-drawer-foot">
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            disabled={!dirty || !valid || pending}
            onClick={save}
          >
            {pending ? t("weightsSaving") : t("weightsSave")}
          </button>
          <button type="button" className="sru-btn" onClick={() => dialogRef.current?.close()}>
            {t("closeButton")}
          </button>
        </div>
      </dialog>
    </>
  );
}
