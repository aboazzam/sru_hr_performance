"use client";

import { useActionState, useEffect, useRef } from "react";
import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AddFormDialog } from "@/components/AddFormDialog";
import { assignBauTask, type AssignBauTaskState } from "@/app/[locale]/(app)/bau-tasks/actions";

export interface EmployeeBauTaskRow {
  id: string;
  titleAr: string;
  cycleName: string;
  weight: number | null;
  status: string;
  score: number | null;
}

/**
 * Routine tasks assigned to this employee, and a form to assign another.
 *
 * Reuses `assignBauTask` unchanged rather than a second write path — the
 * employee is fixed by a hidden field here instead of being picked from a
 * dropdown, which is the only difference from the standalone screen.
 */
export function EmployeeBauTasksPanel({
  employeeId,
  cycles,
  tasks,
  canAssign,
}: {
  employeeId: string;
  cycles: Array<{ id: string; name: string }>;
  tasks: EmployeeBauTaskRow[];
  canAssign: boolean;
}) {
  const t = useTranslations("EmployeeBauTasksTab");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AssignBauTaskState, FormData>(assignBauTask, null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  const errorKeys: Record<string, string> = {
    invalid_input: "errorInvalidInput",
    unauthenticated: "errorUnauthenticated",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: 0, maxWidth: 620 }}>{t("note")}</p>
        {canAssign && cycles.length > 0 ? (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addTask")}
            heading={t("addTask")}
            subtitle={t("addSubtitle")}
            closeLabel={t("closeButton")}
          >
            <form ref={formRef} action={formAction}>
              <input type="hidden" name="employeeId" value={employeeId} />
              <div className="sru-field" style={{ marginBottom: 12 }}>
                <label htmlFor="bau-cycle">{t("cycleLabel")}</label>
                <select id="bau-cycle" name="cycleId" required>
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sru-field" style={{ marginBottom: 12 }}>
                <label htmlFor="bau-title">{t("titleLabel")}</label>
                <input id="bau-title" name="titleAr" type="text" required />
              </div>
              <div className="sru-field" style={{ marginBottom: 12 }}>
                <label htmlFor="bau-weight">{t("weightLabel")}</label>
                <input id="bau-weight" name="weight" type="number" min={0.01} max={100} step={0.01} dir="ltr" />
              </div>
              {state?.status === "error" ? (
                <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                  {t(errorKeys[state.message] ?? "errorUnknown")}
                </p>
              ) : null}
              <button type="submit" className="sru-btn sru-btn-primary sru-btn-slim" disabled={pending}>
                <ClipboardList size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
                {pending ? t("saving") : t("addTask")}
              </button>
            </form>
          </AddFormDialog>
        ) : null}
      </div>

      {cycles.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 14 }}>{t("noCycles")}</p>
      ) : tasks.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 14 }}>{t("empty")}</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: 14 }}>
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>{t("columnTitle")}</th>
                <th>{t("columnCycle")}</th>
                <th>{t("columnWeight")}</th>
                <th>{t("columnStatus")}</th>
                <th>{t("columnScore")}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.titleAr}</td>
                  <td>{task.cycleName}</td>
                  <td>{task.weight != null ? `${task.weight}%` : "—"}</td>
                  <td>{task.status}</td>
                  <td>{task.score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
