"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { X, Pencil } from "lucide-react";
import {
  updateEvaluationCycle,
  type EvaluationCycleActionState,
} from "@/app/[locale]/(app)/evaluations/cycles/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";

const errorKeys: Record<string, string> = {
  invalid_input: "manageErrorInvalid",
  unauthenticated: "manageErrorUnauthenticated",
  forbidden: "manageErrorForbidden",
  has_dependents: "manageErrorHasDependents",
  unknown: "manageErrorUnknown",
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
}

/**
 * The cycle's own details, edited in a side panel rather than in the table
 * row — a cell cannot hold a date picker and a type select without pushing
 * every other column aside.
 *
 * The method weights used to live here too. They moved out on 2026-08-28:
 * weights are set per department now, so they belong on the cycle's weights
 * tab (the default, plus one row per department), not in the dialog for
 * renaming a cycle.
 *
 * Built on <dialog> for the backdrop and the modal focus trap. Escape is
 * wired by hand below — it was measured NOT closing this dialog on its own.
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

  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A save elsewhere re-renders this row with new props; adopt them rather
  // than keeping a stale baseline that would make Save look enabled for a
  // change already stored.
  const [adopted, setAdopted] = useState(cycle);
  if (
    adopted.nameAr !== cycle.nameAr ||
    adopted.nameEn !== cycle.nameEn ||
    adopted.cycleType !== cycle.cycleType ||
    adopted.startDate !== cycle.startDate ||
    adopted.endDate !== cycle.endDate
  ) {
    setAdopted(cycle);
    setSaved(cycle);
    setNameAr(cycle.nameAr);
    setNameEn(cycle.nameEn ?? "");
    setCycleType(cycle.cycleType);
    setStartDate(cycle.startDate);
    setEndDate(cycle.endDate);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setStatus("idle");
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const datesValid = startDate !== "" && endDate !== "" && endDate > startDate;
  const dirty =
    nameAr !== saved.nameAr ||
    nameEn !== (saved.nameEn ?? "") ||
    cycleType !== saved.cycleType ||
    startDate !== saved.startDate ||
    endDate !== saved.endDate;

  function open() {
    setNameAr(saved.nameAr);
    setNameEn(saved.nameEn ?? "");
    setCycleType(saved.cycleType);
    setStartDate(saved.startDate);
    setEndDate(saved.endDate);
    setStatus("idle");
    setErrorCode(null);
    dialogRef.current?.showModal();
  }

  function save() {
    setStatus("idle");
    setErrorCode(null);
    startTransition(async () => {
      const result: EvaluationCycleActionState = await updateEvaluationCycle({
        cycleId: cycle.id,
        nameAr,
        nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
        cycleType,
        startDate,
        endDate,
      });
      if (result.status === "success") {
        const next: CycleEditDrawerCycle = {
          id: cycle.id,
          nameAr,
          nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
          cycleType,
          startDate,
          endDate,
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

  if (!canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="sru-icon-action"
        title={t("cycleEditTitle")}
        aria-label={t("cycleEditTitle")}
      >
        <Pencil size={15} aria-hidden />
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

          {status === "saved" ? (
            <p style={{ color: "var(--sru-success, #1f9d55)", fontSize: 12, marginTop: 8 }}>
              {t("cycleSaved")}
            </p>
          ) : null}
          {status === "error" ? (
            <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>
              {t(errorKeys[errorCode ?? "unknown"] ?? "manageErrorUnknown")}
            </p>
          ) : null}
        </div>

        <div className="sru-drawer-foot">
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            disabled={!dirty || !datesValid || pending}
            onClick={save}
          >
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
