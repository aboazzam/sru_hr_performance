"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
              {/* Every position, not just this unit's: a dean's own parent is
                  the president, who belongs to another unit. */}
              <ParentPositionPicker
                id={`pos-${unitId}-parent`}
                label={t("positionParent")}
                value={newParentId}
                onChange={setNewParentId}
                options={allPositions}
                nameOf={nameOf}
                noneLabel={t("positionParentNone")}
              />
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
 * One control for choosing a position's parent: a combobox, not a search box
 * stacked on a select.
 *
 * The first version put the two side by side, and it misread badly (2026-08-31:
 * "التبعية لا يظهر لي القائمة المنسدلة وإنما أكتب نص وإذا كتبته لا يظهر بعد
 * الحفظ"). Typing into what looked like the field set nothing, so a position
 * was saved with no parent and the typed text vanished. Here the box the user
 * types in IS the field: it shows the current parent, filtering happens as they
 * type, and a value is only ever set by picking from the list.
 *
 * Leaving the box on stray text never changes the saved value -- it snaps back
 * to whatever is actually selected, so what is on screen is always what will be
 * saved.
 */
function ParentPositionPicker({
  id,
  label,
  value,
  onChange,
  options,
  nameOf,
  noneLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: PositionOption[];
  nameOf: (option: PositionOption) => string;
  noneLabel: string;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.id === value) ?? null;
  const selectedLabel = selected ? nameOf(selected) : noneLabel;
  const trimmed = query.trim();
  const matching =
    trimmed === "" ? options : options.filter((option) => includesIgnoringHamza(nameOf(option), trimmed));

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  // Closing on an outside mousedown, the same way this app's other menus do,
  // rather than relying on the input's own blur: blur does not fire when focus
  // never actually moved (a click on a non-focusable area, for one), which left
  // the box showing typed text that was not the saved value -- exactly the
  // confusion this control exists to end. Escape closes it too.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setQuery("");
    };
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="sru-field" ref={boxRef} style={{ position: "relative", minWidth: 220 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        // Typing shows the query; otherwise the box shows the real selection,
        // so the field always reads as its own value rather than as a filter.
        value={open ? query : selected ? selectedLabel : ""}
        placeholder={selected ? selectedLabel : noneLabel}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          // Delayed so a click on an option lands before the list closes.
          window.setTimeout(() => {
            setOpen(false);
            setQuery("");
          }, 150);
        }}
      />
      {open ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          style={{
            position: "absolute",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            top: "100%",
            zIndex: 20,
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: 220,
            overflowY: "auto",
            background: "#fff",
            border: "1.4px solid rgba(80, 30, 140, 0.18)",
            boxShadow: "0 8px 22px rgba(30, 10, 60, 0.12)",
          }}
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className="sru-combobox-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose("")}
            >
              {noneLabel}
            </button>
          </li>
          {matching.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                className="sru-combobox-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.id)}
              >
                {nameOf(option)}
              </button>
            </li>
          ))}
          {matching.length === 0 ? (
            <li style={{ padding: "8px 10px", fontSize: 11.5, color: "var(--sru-muted)" }}>
              {t("positionParentNoMatches")}
            </li>
          ) : null}
        </ul>
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
            label={t("positionParent")}
            value={parentId}
            onChange={setParentId}
            options={allPositions}
            nameOf={nameOf}
            noneLabel={t("positionParentNone")}
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
