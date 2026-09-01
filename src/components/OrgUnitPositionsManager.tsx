"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Trash2, Save, Users, ChevronDown } from "lucide-react";
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
  unitLevelId,
  positions,
  allPositions,
  levels,
  canEdit,
}: {
  unitId: string;
  unitNameAr: string;
  /** The unit's own level; a new position inherits it. */
  unitLevelId: string | null;
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
  // Asked for on 2026-08-31: "احذف خانة ... فهذا تحديد المستوى يظهر في
  // النموذج عند اضافة او تحرير الوحدة التنظيمية" -- the level belongs to the
  // unit, so a position takes its unit's. The picker below is kept ONLY for a
  // unit that has no level yet, because org_structure_positions.level_id is
  // NOT NULL and would otherwise have nothing to write.
  const [newLevelId, setNewLevelId] = useState(unitLevelId ?? levels[0]?.id ?? "");
  const levelComesFromUnit = unitLevelId != null;
  const [newParentId, setNewParentId] = useState("");

  const refresh = () => router.refresh();
  // The option names a POSITION. The unit is appended only when it says
  // something the position name does not: most chart positions were created
  // named after their own unit, so comparing against the CURRENT unit (as this
  // did) produced "كلية الطب — كلية الطب" and made the list read as a list of
  // departments rather than of posts (2026-08-31: "ضع لي تبعية المنصب لمنصب
  // وليست إدارة").
  // The option is the POST alone. Its department is the heading it sits
  // under, not a suffix: appending it produced "رئيس مركز إدارة المحتوى —
  // مركز إدارة المحتوى", which repeats itself and buries the post in noise
  // (2026-09-01: "أظهر أسماء الإدارات").
  const nameOf = (option: PositionOption) => option.nameAr;

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
              {levelComesFromUnit ? null : (
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
                  <span style={{ fontSize: 11, color: "var(--sru-muted)" }}>{t("positionLevelFallback")}</span>
                </div>
              )}
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
 * The parent picker: a button showing the current parent, opening a panel
 * whose FIRST row is the search box.
 *
 * Two earlier shapes were wrong, both reported. A search input beside a select
 * read as the field itself, so typing set nothing and the position saved with
 * no parent. Folding the search INTO the value box was closer but still put a
 * "ابحث عن منصب..." placeholder where the value belongs, which read as an
 * empty field rather than as a chosen parent (2026-08-31: "الحقل المضلل
 * استبدله بنص عنوان التبعية ... اجعل اول خيار يسمح بالكتابة للبحث").
 *
 * So the closed control shows only the value, and searching lives inside the
 * open list where it cannot be mistaken for the value. Leaving the panel never
 * changes what is stored: a value is set only by picking a row.
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
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.id === value) ?? null;
  const trimmed = query.trim();
  // Searching matches the department too, so typing a department name finds
  // every post inside it -- otherwise the heading would be visible but
  // unsearchable.
  const matching =
    trimmed === ""
      ? options
      : options.filter(
          (option) =>
            includesIgnoringHamza(option.nameAr, trimmed) ||
            (option.unitNameAr ? includesIgnoringHamza(option.unitNameAr, trimmed) : false)
        );

  // One group per department, in Arabic order; posts with no department come
  // last under their own heading rather than being dropped or left unlabelled.
  const grouped = (() => {
    const byUnit = new Map<string, PositionOption[]>();
    for (const option of matching) {
      const key = option.unitNameAr ?? "";
      const list = byUnit.get(key) ?? [];
      list.push(option);
      byUnit.set(key, list);
    }
    const named = [...byUnit.entries()]
      .filter(([unit]) => unit !== "")
      .sort((a, b) => a[0].localeCompare(b[0], "ar"));
    const unnamed = byUnit.get("");
    return unnamed ? [...named, ["", unnamed] as [string, PositionOption[]]] : named;
  })();

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  // Closed by an outside mousedown, the same way this app's other menus are:
  // blur does not fire when focus never actually moves, which left a stale
  // panel open over the row.
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
      <button
        type="button"
        id={id}
        className="sru-combobox-value"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
          setQuery("");
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >
        <span>{selected ? nameOf(selected) : noneLabel}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="sru-combobox-panel" role="listbox" aria-labelledby={id}>
          {/* The first row, as asked: searching happens inside the list, never
              in the place where the value is shown. */}
          <input
            ref={searchRef}
            type="text"
            autoComplete="off"
            className="sru-combobox-search"
            placeholder={t("positionParentSearch")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 200, overflowY: "auto" }}>
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                className="sru-combobox-option"
                onClick={() => choose("")}
              >
                {noneLabel}
              </button>
            </li>
            {grouped.map(([unitName, groupOptions]) => (
              <li key={unitName || "__none__"}>
                <div className="sru-combobox-group" role="presentation">
                  {unitName || t("positionParentNoUnit")}
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {groupOptions.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.id === value}
                        className="sru-combobox-option"
                        onClick={() => choose(option.id)}
                      >
                        {nameOf(option)}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {matching.length === 0 ? (
              <li style={{ padding: "8px 10px", fontSize: 11.5, color: "var(--sru-muted)" }}>
                {t("positionParentNoMatches")}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}


function PositionRow({
  position,
  allPositions,
  nameOf,
  canEdit,
  onDone,
}: {
  position: UnitPosition;
  allPositions: PositionOption[];
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
