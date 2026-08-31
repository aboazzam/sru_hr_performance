"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Trash2, Save, Users } from "lucide-react";
import { AddFormDialog } from "@/components/AddFormDialog";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import {
  addPosition,
  updatePosition,
  deletePosition,
} from "@/app/[locale]/(app)/admin/org-structure/actions";

export interface UnitPosition {
  id: string;
  nameAr: string;
  nameEn: string | null;
  levelId: string;
  parentId: string | null;
  orgUnitId: string | null;
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
  canEdit,
}: {
  unitId: string;
  unitNameAr: string;
  positions: UnitPosition[];
  allPositions: PositionOption[];
  levels: Array<{ id: string; nameAr: string }>;
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
  // The option names a POSITION. The unit is appended only when it says
  // something the position name does not: most chart positions were created
  // named after their own unit, so comparing against the CURRENT unit (as this
  // did) produced "كلية الطب — كلية الطب" and made the list read as a list of
  // departments rather than of posts (2026-08-31: "ضع لي تبعية المنصب لمنصب
  // وليست إدارة").
  const nameOf = (option: PositionOption) =>
    option.unitNameAr && option.unitNameAr !== option.nameAr
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
                <ParentPositionPicker
                  id={`pos-${unitId}-parent`}
                  value={newParentId}
                  onChange={setNewParentId}
                  options={allPositions}
                  nameOf={nameOf}
                  noneLabel={t("positionParentNone")}
                />
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

/**
 * A parent picker over every position in the university.
 *
 * The list runs to sixty-odd entries, so it carries its own search — the same
 * narrow-the-select pattern the job-title and employee pickers use, and
 * hamza-insensitive for the same reason. The chosen value survives a search
 * that no longer matches it: filtering the options must not silently change
 * what the row is about to save.
 */
function ParentPositionPicker({
  id,
  value,
  onChange,
  options,
  nameOf,
  noneLabel,
  compact = false,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: PositionOption[];
  nameOf: (option: PositionOption) => string;
  noneLabel: string;
  /** Inline in a row rather than stacked in a form. */
  compact?: boolean;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [search, setSearch] = useState("");
  const query = search.trim();
  const matching =
    query === "" ? options : options.filter((option) => includesIgnoringHamza(nameOf(option), query));
  const selected = options.find((option) => option.id === value);

  return (
    <div style={{ display: "flex", flexDirection: compact ? "row" : "column", gap: 6, alignItems: compact ? "center" : "stretch" }}>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("positionParentSearch")}
        style={{ width: compact ? 150 : "100%", fontSize: 13 }}
      />
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: compact ? 200 : "100%", fontSize: 13 }}
      >
        <option value="">{noneLabel}</option>
        {/* Kept even when the search excludes it, so narrowing the list never
            quietly drops the parent already chosen. */}
        {selected && !matching.some((option) => option.id === selected.id) ? (
          <option value={selected.id}>{nameOf(selected)}</option>
        ) : null}
        {matching.map((option) => (
          <option key={option.id} value={option.id}>
            {nameOf(option)}
          </option>
        ))}
      </select>
      {query !== "" && matching.length === 0 ? (
        <span style={{ fontSize: 11, color: "var(--sru-muted)" }}>{t("positionParentNoMatches")}</span>
      ) : null}
    </div>
  );
}

function PositionRow({
  position,
  allPositions,
  levels,
  nameOf,
  canEdit,
  onDone,
}: {
  position: UnitPosition;
  allPositions: PositionOption[];
  levels: Array<{ id: string; nameAr: string }>;
  nameOf: (option: PositionOption) => string;
  canEdit: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [nameAr, setNameAr] = useState(position.nameAr);
  const [nameEn, setNameEn] = useState(position.nameEn ?? "");
  const [parentId, setParentId] = useState(position.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    nameAr !== position.nameAr ||
    nameEn !== (position.nameEn ?? "") ||
    parentId !== (position.parentId ?? "");
  const levelName = levels.find((level) => level.id === position.levelId)?.nameAr ?? "—";

  function run(fn: () => Promise<{ status: string; message?: string }>, confirm = false) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") {
        // Reported on 2026-08-31 as "لم أره قد انعكس": the rename HAD saved,
        // but nothing on screen said so -- the field already showed the typed
        // text, so a successful save and a dropped one looked identical.
        if (confirm) setSaved(true);
        onDone();
      } else {
        setError(result.message ?? "unknown");
      }
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 0",
        borderBottom: "1px solid var(--sru-border)",
        flexWrap: "wrap",
      }}
    >
      {canEdit ? (
        <>
          {/* 13px matches .sru-field's own controls; unclassed inputs fell back
              to the 16px browser default and read oversized next to everything
              else on the screen (2026-08-31). */}
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} style={{ width: 160, fontSize: 13 }} />
          <input
            value={nameEn}
            dir="ltr"
            onChange={(e) => setNameEn(e.target.value)}
            style={{ width: 130, fontSize: 13 }}
          />
          <ParentPositionPicker
            id={`row-${position.id}-parent`}
            value={parentId}
            onChange={setParentId}
            options={allPositions}
            nameOf={nameOf}
            noneLabel={t("positionParentNone")}
            compact
          />
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
              run(
                () =>
                  updatePosition(
                    position.id,
                    nameAr,
                    nameEn,
                    position.orgUnitId,
                    parentId === "" ? null : parentId
                  ),
                true
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
      {saved && !dirty ? (
        <span role="status" style={{ fontSize: 11, color: "var(--sru-success, #1f9d55)" }}>
          {t("positionSaved")}
        </span>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: "#b91c1c" }}>
          {t(errorKeys[error] ?? "errorUnknown")}
        </span>
      ) : null}
    </div>
  );
}
