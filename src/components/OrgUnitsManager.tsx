"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Pencil, Trash2, Plus, Save } from "lucide-react";
import { AddFormDialog } from "@/components/AddFormDialog";
import { OrgUnitFormFields, type OrgUnitFormValue } from "@/components/OrgUnitFormFields";
import {
  createOrgUnit,
  updateOrgUnit,
  deleteOrgUnit,
  type OrgUnitActionState,
} from "@/app/[locale]/(app)/org-units/actions";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import { computeOrgUnitIndents } from "@/lib/orgUnitIndent";
import type { OrgUnitClassification } from "@/lib/orgUnitTypes";
import { ExportMenu } from "@/components/ExportMenu";
import {
  OrgUnitPositionsManager,
  type UnitPosition,
  type PositionOption,
} from "@/components/OrgUnitPositionsManager";
import { ORG_UNIT_EXPORT_COLUMNS } from "@/lib/orgUnitExportColumns";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate_code: "errorDuplicateCode",
  duplicate_name: "errorDuplicateName",
  second_root: "errorSecondRoot",
  cycle: "errorCycle",
  has_dependents: "errorHasDependents",
  unknown: "errorUnknown",
};

export interface OrgUnitRow {
  id: string;
  nameAr: string;
  nameEn: string | null;
  unitCode: string | null;
  kindId: string;
  kindNameAr: string;
  typeId: string | null;
  typeNameAr: string | null;
  levelId: string | null;
  levelNameAr: string | null;
  levelOrder: number | null;
  parentId: string | null;
}

type Node = OrgUnitRow & { children: Node[] };

/** Builds the tree from the flat rows; anything whose parent is missing is
 *  shown at the top rather than silently dropped. */
function buildTree(rows: OrgUnitRow[]): Node[] {
  const byId = new Map<string, Node>(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots: Node[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** The unit's own subtree — the set it can never be moved into. */
function descendantIdsOf(rows: OrgUnitRow[], id: string): Set<string> {
  const found = new Set<string>();
  const walk = (current: string) => {
    for (const row of rows) {
      if (row.parentId === current && !found.has(row.id)) {
        found.add(row.id);
        walk(row.id);
      }
    }
  };
  walk(id);
  return found;
}

function UnitRow({
  node,
  indent,
  rows,
  kinds,
  types,
  levels,
  positionsByUnit,
  allPositions,
  indents,
  canEditPositions,
  canEdit,
  onDone,
}: {
  node: Node;
  /** Steps of indentation, from the unit's LEVEL -- see computeOrgUnitIndents. */
  indent: number;
  rows: OrgUnitRow[];
  kinds: OrgUnitClassification[];
  types: OrgUnitClassification[];
  levels: Array<{ id: string; nameAr: string }>;
  positionsByUnit: Record<string, UnitPosition[]>;
  allPositions: PositionOption[];
  indents: Map<string, number>;
  canEditPositions: boolean;
  canEdit: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("OrgUnitsPage");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<OrgUnitFormValue>({
    nameAr: node.nameAr,
    nameEn: node.nameEn ?? "",
    unitCode: node.unitCode ?? "",
    kindId: node.kindId,
    typeId: node.typeId ?? "",
    levelId: node.levelId ?? "",
    parentId: node.parentId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A unit cannot move under itself or under anything beneath it — the same
  // rule the action enforces, mirrored here so the impossible choice is never
  // offered in the first place.
  const descendantIds = descendantIdsOf(rows, node.id);
  const parentOptions = rows
    .filter((row) => row.id !== node.id && !descendantIds.has(row.id))
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  const dirty =
    form.nameAr !== node.nameAr ||
    form.nameEn !== (node.nameEn ?? "") ||
    form.unitCode !== (node.unitCode ?? "") ||
    form.kindId !== node.kindId ||
    form.typeId !== (node.typeId ?? "") ||
    form.levelId !== (node.levelId ?? "") ||
    form.parentId !== (node.parentId ?? "");

  function run(fn: () => Promise<OrgUnitActionState>, close = false) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") {
        if (close) dialogRef.current?.close();
        onDone();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <li>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 0",
          paddingInlineStart: indent * 18,
          borderBottom: "1px solid var(--sru-border)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ flex: 1, minWidth: 200 }}>
          {node.nameAr}
          {node.nameEn ? <span className="sru-name-en">{node.nameEn}</span> : null}
        </span>
        <span className="pill" style={{ fontSize: 11 }}>
          {node.kindNameAr}
        </span>
        {node.typeNameAr ? (
          <span className="pill" style={{ fontSize: 11 }}>
            {node.typeNameAr}
          </span>
        ) : null}
        {node.levelNameAr ? (
          <span className="pill" style={{ fontSize: 11 }}>
            {node.levelNameAr}
          </span>
        ) : null}
        {node.unitCode ? (
          <span className="sru-en" style={{ fontSize: 11, color: "var(--sru-muted)" }}>
            {node.unitCode}
          </span>
        ) : null}
        {canEdit ? (
          <>
            {/* Editing is the same dialog as adding, opened by this row's own
                pencil — not a row of bare inputs shoved into the tree. */}
            <AddFormDialog
              dialogRef={dialogRef}
              triggerLabel={t("editButton")}
              heading={t("editHeading")}
              subtitle={node.nameAr}
              closeLabel={t("closeButton")}
              triggerClassName="sru-icon-action"
              triggerIcon={<Pencil size={14} aria-hidden />}
            >
              <OrgUnitFormFields
                idPrefix={`unit-${node.id}`}
                value={form}
                onChange={setForm}
                kinds={kinds}
                types={types}
                levels={levels}
                parentOptions={parentOptions}
                allowNoParent={node.parentId === null}
              />
              {error ? (
                <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>
                  {t(errorKeys[error] ?? "errorUnknown")}
                </p>
              ) : null}
              <div className="sru-form-submitrow">
                <button
                  type="button"
                  className="sru-btn sru-btn-primary sru-btn-slim"
                  disabled={pending || !dirty || form.nameAr.trim() === "" || form.unitCode.trim() === ""}
                  onClick={() =>
                    run(
                      () =>
                        updateOrgUnit({
                          id: node.id,
                          nameAr: form.nameAr,
                          nameEn: form.nameEn.trim() === "" ? null : form.nameEn,
                          unitCode: form.unitCode.trim(),
                          kindId: form.kindId,
                          typeId: form.typeId === "" ? null : form.typeId,
                          levelId: form.levelId === "" ? null : form.levelId,
                          parentId: form.parentId === "" ? null : form.parentId,
                        }),
                      true
                    )
                  }
                >
                  <Save size={14} aria-hidden />
                  {t("saveButton")}
                </button>
              </div>
            </AddFormDialog>
            <OrgUnitPositionsManager
              unitId={node.id}
              unitNameAr={node.nameAr}
              unitLevelId={node.levelId}
              positions={positionsByUnit[node.id] ?? []}
              allPositions={allPositions}
              levels={levels}
              canEdit={canEditPositions}
            />
            <button
              type="button"
              className="sru-icon-action danger"
              title={t("deleteButton")}
              aria-label={t("deleteButton")}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("deleteConfirm"))) return;
                run(() => deleteOrgUnit(node.id));
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

      {node.children.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {node.children.map((child) => (
            <UnitRow
              key={child.id}
              node={child}
              indent={indents.get(child.id) ?? indent + 1}
              rows={rows}
              kinds={kinds}
              types={types}
              levels={levels}
              positionsByUnit={positionsByUnit}
              allPositions={allPositions}
              indents={indents}
              canEditPositions={canEditPositions}
              canEdit={canEdit}
              onDone={onDone}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The org units, read from and written to `org_units` itself.
 *
 * Until 2026-08-29 this screen rendered a hand-transcribed copy of the
 * original org chart held in the source tree, while every other screen read
 * the table — two versions of the same fact, and they had already drifted by
 * one unit. The table is the only source now.
 */
export function OrgUnitsManager({
  rows,
  kinds,
  types,
  levels,
  positionsByUnit,
  allPositions,
  canEditPositions,
  canEdit,
}: {
  rows: OrgUnitRow[];
  kinds: OrgUnitClassification[];
  types: OrgUnitClassification[];
  levels: Array<{ id: string; nameAr: string }>;
  positionsByUnit: Record<string, UnitPosition[]>;
  allPositions: PositionOption[];
  canEditPositions: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("OrgUnitsPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const emptyForm: OrgUnitFormValue = {
    nameAr: "",
    nameEn: "",
    unitCode: "",
    kindId: kinds[0]?.id ?? "",
    typeId: "",
    levelId: "",
    parentId: "",
  };
  const [form, setForm] = useState<OrgUnitFormValue>(emptyForm);

  const refresh = () => router.refresh();

  // Searching flattens the tree on purpose: a match three levels down would
  // otherwise be hidden inside a branch the reader has to guess at.
  const matching = rows.filter(
    (row) =>
      search.trim() !== "" &&
      (includesIgnoringHamza(row.nameAr, search) ||
        (row.nameEn ? row.nameEn.toLowerCase().includes(search.trim().toLowerCase()) : false))
  );
  // One pass over the whole list: a unit's indent comes from its level, and
  // an unlevelled one needs its parent's indent, so it cannot be worked out
  // from a single row in isolation.
  const indents = computeOrgUnitIndents(
    rows.map((row) => ({ id: row.id, parentId: row.parentId, levelOrder: row.levelOrder }))
  );
  const tree = buildTree(rows);
  const sortedRows = [...rows].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createOrgUnit({
        nameAr: form.nameAr,
        nameEn: form.nameEn.trim() === "" ? null : form.nameEn,
        unitCode: form.unitCode.trim(),
        kindId: form.kindId,
        typeId: form.typeId === "" ? null : form.typeId,
        levelId: form.levelId === "" ? null : form.levelId,
        parentId: form.parentId === "" ? null : form.parentId,
      });
      if (result.status === "success") {
        setForm(emptyForm);
        dialogRef.current?.close();
        refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          style={{ maxWidth: 320 }}
        />
        <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("unitCount", { count: rows.length })}</span>
        {/* One "تصدير" control (PDF / Excel / CSV + a column picker), the same
            one the employees and vacancies screens use. The search text goes
            with it so the file matches what is on screen. */}
        <ExportMenu
          columns={ORG_UNIT_EXPORT_COLUMNS.map((key) => ({ key, label: t(`exportColumn_${key}`) }))}
          filenameBase="org-units"
          buildHref={(format, columns) => {
            const params = new URLSearchParams();
            if (search.trim() !== "") params.set("q", search.trim());
            params.set("format", format);
            params.set("columns", columns.join(","));
            return `/api/org-units/export?${params}`;
          }}
          labels={{
            export: t("exportButton"),
            pdf: t("exportPdf"),
            excel: t("exportExcel"),
            csv: t("exportCsv"),
            columnsHeading: t("exportColumnsHeading"),
            columnsNote: t("exportColumnsNote"),
            confirm: t("exportConfirmButton"),
            close: t("closeButton"),
          }}
        />
        {canEdit ? (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addUnit")}
            heading={t("addUnit")}
            subtitle={t("addSubtitle")}
            closeLabel={t("closeButton")}
          >
            <OrgUnitFormFields
              idPrefix="new-unit"
              value={form}
              onChange={setForm}
              kinds={kinds}
              types={types}
              levels={levels}
              parentOptions={sortedRows}
              allowNoParent={false}
            />
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>
                {t(errorKeys[error] ?? "errorUnknown")}
              </p>
            ) : null}
            <div className="sru-form-submitrow">
              <button
                type="button"
                className="sru-btn sru-btn-primary sru-btn-slim"
                disabled={
                  pending || form.nameAr.trim() === "" || form.unitCode.trim() === "" || form.parentId === ""
                }
                onClick={add}
              >
                <Plus size={14} aria-hidden />
                {t("addUnit")}
              </button>
            </div>
          </AddFormDialog>
        ) : null}
      </div>

      <div className="sru-card" style={{ padding: "6px 14px" }}>
        {search.trim() !== "" ? (
          matching.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5, padding: "10px 0" }}>{t("noMatches")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {matching.map((row) => (
                <UnitRow
                  key={row.id}
                  node={{ ...row, children: [] }}
                  indent={0}
                  rows={rows}
                  kinds={kinds}
                  types={types}
                  levels={levels}
                  positionsByUnit={positionsByUnit}
                  allPositions={allPositions}
                  indents={indents}
                  canEditPositions={canEditPositions}
                  canEdit={canEdit}
                  onDone={refresh}
                />
              ))}
            </ul>
          )
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {tree.map((root) => (
              <UnitRow
                key={root.id}
                node={root}
                indent={indents.get(root.id) ?? 0}
                rows={rows}
                kinds={kinds}
                types={types}
                levels={levels}
                positionsByUnit={positionsByUnit}
                allPositions={allPositions}
                indents={indents}
                canEditPositions={canEditPositions}
                canEdit={canEdit}
                onDone={refresh}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
