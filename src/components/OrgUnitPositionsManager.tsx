"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Trash2, Save, Users, UserPlus, UserMinus } from "lucide-react";
import { AddFormDialog } from "@/components/AddFormDialog";
import {
  addPosition,
  updatePosition,
  deletePosition,
  assignEmployee,
  unassignEmployee,
} from "@/app/[locale]/(app)/admin/org-structure/actions";

export interface UnitPosition {
  id: string;
  nameAr: string;
  nameEn: string | null;
  levelId: string;
  parentId: string | null;
  orgUnitId: string | null;
}

/** One employee staffed onto a position. */
export interface PositionAssignment {
  assignmentId: string;
  employeeId: string;
  nameAr: string;
}

export interface EmployeeOption {
  id: string;
  nameAr: string;
  employeeNumber: string | null;
}

export interface PositionOption {
  id: string;
  nameAr: string;
  /** The unit it belongs to, so a parent from elsewhere is recognisable. */
  unitNameAr: string | null;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "posErrorDuplicate",
  has_dependents: "posErrorHasDependents",
  unknown: "errorUnknown",
};

/**
 * The positions belonging to ONE unit, with their reporting line.
 *
 * Asked for on 2026-08-30: "اضافة أكثر من منصب للوحدة مثل عميد وتكون تبعيته
 * للرئيس ووكيل الكلية تبعيته للعميد" — so two things matter and neither is a
 * schema change:
 *
 *   * A unit may hold several positions. `org_structure_positions.org_unit_id`
 *     has always allowed that; only one unit actually used it, because no
 *     screen offered it.
 *   * A position's parent is NOT restricted to its own unit. A dean reports to
 *     the president, who sits in a different unit entirely, while the
 *     vice-dean reports to the dean inside it. So the parent list is every
 *     position, labelled with the unit it comes from.
 *
 * These are the same `org_structure_positions` rows the org chart draws, via
 * the same actions the org-structure screen uses — so a position added here
 * appears there, rather than becoming a second, private list of posts.
 */
export function OrgUnitPositionsManager({
  unitId,
  unitNameAr,
  positions,
  allPositions,
  levels,
  assignmentsByPosition,
  employees,
  canStaff,
  canEdit,
}: {
  unitId: string;
  unitNameAr: string;
  positions: UnitPosition[];
  allPositions: PositionOption[];
  levels: Array<{ id: string; nameAr: string }>;
  assignmentsByPosition: Record<string, PositionAssignment[]>;
  employees: EmployeeOption[];
  canStaff: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("OrgUnitsPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newNameAr, setNewNameAr] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newLevelId, setNewLevelId] = useState(levels[0]?.id ?? "");
  const [newParentId, setNewParentId] = useState("");

  const refresh = () => router.refresh();
  const nameOf = (option: PositionOption) =>
    option.unitNameAr && option.unitNameAr !== unitNameAr
      ? `${option.nameAr} — ${option.unitNameAr}`
      : option.nameAr;

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addPosition(
        newLevelId,
        newNameAr,
        newNameEn,
        newParentId || undefined,
        unitId
      );
      if (result.status === "success") {
        setNewNameAr("");
        setNewNameEn("");
        setNewParentId("");
        addRef.current?.close();
        refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <AddFormDialog
      dialogRef={dialogRef}
      triggerLabel={t("positionsButton")}
      heading={t("positionsHeading")}
      subtitle={unitNameAr}
      closeLabel={t("closeButton")}
      triggerClassName="sru-icon-action"
      triggerIcon={<Users size={14} aria-hidden />}
    >
      <p style={{ color: "var(--sru-muted)", fontSize: 11.5, lineHeight: 1.7, marginBottom: 10 }}>
        {t("positionsNote")}
      </p>

      {positions.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("positionsEmpty")}</p>
      ) : (
        positions.map((position) => (
          <PositionRow
            key={position.id}
            position={position}
            allPositions={allPositions.filter((option) => option.id !== position.id)}
            levels={levels}
            nameOf={nameOf}
            assignments={assignmentsByPosition[position.id] ?? []}
            employees={employees}
            canStaff={canStaff}
            canEdit={canEdit}
            onDone={refresh}
          />
        ))
      )}

      {canEdit ? (
        <div style={{ marginTop: 12 }}>
          <AddFormDialog
            dialogRef={addRef}
            triggerLabel={t("positionAdd")}
            heading={t("positionAdd")}
            closeLabel={t("closeButton")}
            triggerClassName="sru-btn sru-btn-slim"
          >
            <div className="sru-formgrid">
              <div className="sru-field">
                <label htmlFor={`pos-${unitId}-nameAr`}>{t("positionNameAr")}</label>
                <input
                  id={`pos-${unitId}-nameAr`}
                  value={newNameAr}
                  required
                  onChange={(e) => setNewNameAr(e.target.value)}
                />
              </div>
              <div className="sru-field">
                <label htmlFor={`pos-${unitId}-nameEn`}>{t("positionNameEn")}</label>
                <input
                  id={`pos-${unitId}-nameEn`}
                  value={newNameEn}
                  dir="ltr"
                  onChange={(e) => setNewNameEn(e.target.value)}
                />
              </div>
              <div className="sru-field">
                <label htmlFor={`pos-${unitId}-level`}>{t("fieldLevel")}</label>
                <select
                  id={`pos-${unitId}-level`}
                  value={newLevelId}
                  onChange={(e) => setNewLevelId(e.target.value)}
                >
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sru-field">
                <label htmlFor={`pos-${unitId}-parent`}>{t("positionParent")}</label>
                {/* Every position, not just this unit's: a dean's own parent
                    is the president, who belongs to another unit. */}
                <select
                  id={`pos-${unitId}-parent`}
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                >
                  <option value="">{t("positionParentNone")}</option>
                  {allPositions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {nameOf(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>
                {t(errorKeys[error] ?? "errorUnknown")}
              </p>
            ) : null}
            <div className="sru-form-submitrow">
              <button
                type="button"
                className="sru-btn sru-btn-primary sru-btn-slim"
                disabled={pending || newNameAr.trim() === "" || newLevelId === ""}
                onClick={add}
              >
                <Plus size={14} aria-hidden />
                {t("positionAdd")}
              </button>
            </div>
          </AddFormDialog>
        </div>
      ) : null}
    </AddFormDialog>
  );
}

function PositionRow({
  position,
  allPositions,
  levels,
  nameOf,
  assignments,
  employees,
  canStaff,
  canEdit,
  onDone,
}: {
  position: UnitPosition;
  allPositions: PositionOption[];
  levels: Array<{ id: string; nameAr: string }>;
  nameOf: (option: PositionOption) => string;
  assignments: PositionAssignment[];
  employees: EmployeeOption[];
  canStaff: boolean;
  canEdit: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [nameAr, setNameAr] = useState(position.nameAr);
  const [nameEn, setNameEn] = useState(position.nameEn ?? "");
  const [parentId, setParentId] = useState(position.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [staffId, setStaffId] = useState("");

  const dirty =
    nameAr !== position.nameAr ||
    nameEn !== (position.nameEn ?? "") ||
    parentId !== (position.parentId ?? "");
  const levelName = levels.find((level) => level.id === position.levelId)?.nameAr ?? "—";

  function run(fn: () => Promise<{ status: string; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") onDone();
      else setError(result.message ?? "unknown");
    });
  }

  return (
    <div style={{ padding: "7px 0", borderBottom: "1px solid var(--sru-border)" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {canEdit ? (
        <>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} style={{ width: 160 }} />
          <input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} style={{ width: 130 }} />
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ width: 200 }}>
            <option value="">{t("positionParentNone")}</option>
            {allPositions.map((option) => (
              <option key={option.id} value={option.id}>
                {nameOf(option)}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span style={{ minWidth: 200 }}>
          {position.nameAr}
          {position.nameEn ? <span className="sru-name-en">{position.nameEn}</span> : null}
        </span>
      )}
      <span className="pill" style={{ fontSize: 11 }}>
        {levelName}
      </span>
      {canEdit ? (
        <>
          <button
            type="button"
            className="sru-icon-action"
            title={t("saveButton")}
            aria-label={t("saveButton")}
            disabled={pending || !dirty || nameAr.trim() === ""}
            onClick={() =>
              run(() =>
                updatePosition(
                  position.id,
                  nameAr,
                  nameEn,
                  position.orgUnitId,
                  parentId === "" ? null : parentId
                )
              )
            }
          >
            <Save size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="sru-icon-action danger"
            title={t("deleteButton")}
            aria-label={t("deleteButton")}
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("positionDeleteConfirm"))) return;
              run(() => deletePosition(position.id));
            }}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: "#b91c1c" }}>
          {t(errorKeys[error] ?? "errorUnknown")}
        </span>
      ) : null}
    </div>

    {/* Staffing, in the same row as the position it fills -- moved here from
        the separate التسكين screen (2026-08-30: "نربط كل ما يتعلق بالمناصب
        والتسكين ... بصفحة الوحدات التنظيمية"). Gated on `staffing`, its own
        process area: org_structure_assignments' RLS is separate from the
        positions table's, so a caller may edit a position without being
        allowed to fill it. */}
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap", paddingInlineStart: 4 }}>
      <span style={{ color: "var(--sru-muted)", fontSize: 11 }}>{t("staffLabel")}</span>
      {assignments.length === 0 ? (
        <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("staffVacant")}</span>
      ) : (
        assignments.map((assignment) => (
          <span
            key={assignment.assignmentId}
            className="pill"
            style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {assignment.nameAr}
            {canStaff ? (
              <button
                type="button"
                className="sru-icon-action danger"
                title={t("staffRemove")}
                aria-label={t("staffRemove")}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t("staffRemoveConfirm"))) return;
                  run(() => unassignEmployee(assignment.assignmentId));
                }}
              >
                <UserMinus size={12} aria-hidden />
              </button>
            ) : null}
          </span>
        ))
      )}
      {canStaff ? (
        <>
          <select
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
            style={{ width: 190 }}
            aria-label={t("staffAdd")}
          >
            <option value="">{t("staffPick")}</option>
            {employees
              .filter((employee) => !assignments.some((a) => a.employeeId === employee.id))
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeNumber ? `${employee.employeeNumber} — ${employee.nameAr}` : employee.nameAr}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="sru-icon-action"
            title={t("staffAdd")}
            aria-label={t("staffAdd")}
            disabled={pending || staffId === ""}
            onClick={() =>
              run(async () => {
                const result = await assignEmployee(position.id, staffId);
                if (result.status === "success") setStaffId("");
                return result;
              })
            }
          >
            <UserPlus size={14} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
    </div>
  );
}
