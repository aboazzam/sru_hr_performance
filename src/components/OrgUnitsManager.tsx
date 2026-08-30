"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { AddFormDialog } from "@/components/AddFormDialog";
import {
  createOrgUnit,
  updateOrgUnit,
  deleteOrgUnit,
  type OrgUnitActionState,
} from "@/app/[locale]/(app)/org-units/actions";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import { orgUnitKinds } from "@/lib/orgUnitTypes";
import { ExportMenu } from "@/components/ExportMenu";
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
  kind: string;
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

function UnitRow({
  node,
  depth,
  rows,
  canEdit,
  onDone,
}: {
  node: Node;
  depth: number;
  rows: OrgUnitRow[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [editing, setEditing] = useState(false);
  const [nameAr, setNameAr] = useState(node.nameAr);
  const [nameEn, setNameEn] = useState(node.nameEn ?? "");
  const [unitCode, setUnitCode] = useState(node.unitCode ?? "");
  const [kind, setKind] = useState(node.kind);
  const [parentId, setParentId] = useState(node.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A unit cannot move under itself or under anything beneath it — the same
  // rule the action enforces, mirrored here so the impossible choice is never
  // offered in the first place.
  const descendantIds = new Set<string>();
  const collect = (id: string) => {
    for (const row of rows) {
      if (row.parentId === id && !descendantIds.has(row.id)) {
        descendantIds.add(row.id);
        collect(row.id);
      }
    }
  };
  collect(node.id);
  const parentOptions = rows
    .filter((row) => row.id !== node.id && !descendantIds.has(row.id))
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  const dirty =
    nameAr !== node.nameAr ||
    nameEn !== (node.nameEn ?? "") ||
    unitCode !== (node.unitCode ?? "") ||
    kind !== node.kind ||
    parentId !== (node.parentId ?? "");

  function run(fn: () => Promise<OrgUnitActionState>, close = false) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") {
        if (close) setEditing(false);
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
          paddingInlineStart: depth * 18,
          borderBottom: "1px solid var(--sru-border)",
          flexWrap: "wrap",
        }}
      >
        {editing ? (
          <>
            <div className="sru-field" style={{ width: 200 }}>
              <label htmlFor={`unit-${node.id}-nameAr`}>{t("fieldNameAr")}</label>
              <input id={`unit-${node.id}-nameAr`} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="sru-field" style={{ width: 180 }}>
              <label htmlFor={`unit-${node.id}-nameEn`}>{t("fieldNameEn")}</label>
              <input
                id={`unit-${node.id}-nameEn`}
                value={nameEn}
                dir="ltr"
                onChange={(e) => setNameEn(e.target.value)}
              />
            </div>
            <div className="sru-field" style={{ width: 110 }}>
              <label htmlFor={`unit-${node.id}-code`}>{t("fieldCode")}</label>
              <input id={`unit-${node.id}-code`} value={unitCode} dir="ltr" required onChange={(e) => setUnitCode(e.target.value)} />
            </div>
            <div className="sru-field" style={{ width: 150 }}>
              <label htmlFor={`unit-${node.id}-kind`}>{t("fieldKind")}</label>
              <select id={`unit-${node.id}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
                {orgUnitKinds.map((value) => (
                  <option key={value} value={value}>
                    {t(`kind_${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sru-field" style={{ width: 220 }}>
              <label htmlFor={`unit-${node.id}-parent`}>{t("fieldParent")}</label>
              <select id={`unit-${node.id}-parent`} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t("parentNone")}</option>
                {parentOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="sru-icon-action"
              title={t("saveButton")}
              aria-label={t("saveButton")}
              disabled={pending || !dirty || nameAr.trim() === ""}
              onClick={() =>
                run(
                  () =>
                    updateOrgUnit({
                      id: node.id,
                      nameAr,
                      nameEn: nameEn.trim() === "" ? null : nameEn,
                      unitCode: unitCode.trim(),
                      kind,
                      parentId: parentId === "" ? null : parentId,
                    }),
                  true
                )
              }
            >
              <Check size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="sru-icon-action"
              title={t("cancelButton")}
              aria-label={t("cancelButton")}
              disabled={pending}
              onClick={() => {
                setNameAr(node.nameAr);
                setNameEn(node.nameEn ?? "");
                setUnitCode(node.unitCode ?? "");
                setKind(node.kind);
                setParentId(node.parentId ?? "");
                setError(null);
                setEditing(false);
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, minWidth: 200 }}>
              {node.nameAr}
              {node.nameEn ? <span className="sru-name-en">{node.nameEn}</span> : null}
            </span>
            <span className="pill" style={{ fontSize: 11 }}>
              {t(`kind_${node.kind}`)}
            </span>
            {node.unitCode ? (
              <span className="sru-en" style={{ fontSize: 11, color: "var(--sru-muted)" }}>
                {node.unitCode}
              </span>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("editButton")}
                  aria-label={t("editButton")}
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={14} aria-hidden />
                </button>
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
          </>
        )}
        {error ? (
          <span role="alert" style={{ fontSize: 11, color: "#b91c1c" }}>
            {t(errorKeys[error] ?? "errorUnknown")}
          </span>
        ) : null}
      </div>

      {node.children.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {node.children.map((child) => (
            <UnitRow key={child.id} node={child} depth={depth + 1} rows={rows} canEdit={canEdit} onDone={onDone} />
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
export function OrgUnitsManager({ rows, canEdit }: { rows: OrgUnitRow[]; canEdit: boolean }) {
  const t = useTranslations("OrgUnitsPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newNameAr, setNewNameAr] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newKind, setNewKind] = useState<string>("department");
  const [newParent, setNewParent] = useState("");

  const refresh = () => router.refresh();

  // Searching flattens the tree on purpose: a match three levels down would
  // otherwise be hidden inside a branch the reader has to guess at.
  const matching = rows.filter(
    (row) =>
      search.trim() !== "" &&
      (includesIgnoringHamza(row.nameAr, search) ||
        (row.nameEn ? row.nameEn.toLowerCase().includes(search.trim().toLowerCase()) : false))
  );
  const tree = buildTree(rows);
  const sortedRows = [...rows].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createOrgUnit({
        nameAr: newNameAr,
        nameEn: newNameEn.trim() === "" ? null : newNameEn,
        unitCode: newCode.trim(),
        kind: newKind,
        parentId: newParent === "" ? null : newParent,
      });
      if (result.status === "success") {
        setNewNameAr("");
        setNewNameEn("");
        setNewCode("");
        setNewParent("");
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
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="new-unit-nameAr">{t("fieldNameAr")}</label>
              <input id="new-unit-nameAr" value={newNameAr} onChange={(e) => setNewNameAr(e.target.value)} />
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="new-unit-nameEn">{t("fieldNameEn")}</label>
              <input id="new-unit-nameEn" value={newNameEn} dir="ltr" onChange={(e) => setNewNameEn(e.target.value)} />
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="new-unit-code">{t("fieldCode")}</label>
              <input id="new-unit-code" value={newCode} dir="ltr" required onChange={(e) => setNewCode(e.target.value)} />
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="new-unit-kind">{t("fieldKind")}</label>
              <select id="new-unit-kind" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                {orgUnitKinds.map((value) => (
                  <option key={value} value={value}>
                    {t(`kind_${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="new-unit-parent">{t("fieldParent")}</label>
              {/* No "no parent" option: org_units_single_root allows exactly
                  one rootless unit and the university already has it, so
                  offering the choice only produces a refusal. */}
              <select id="new-unit-parent" value={newParent} onChange={(e) => setNewParent(e.target.value)}>
                <option value="">{t("parentPlaceholder")}</option>
                {sortedRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nameAr}
                  </option>
                ))}
              </select>
            </div>
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                {t(errorKeys[error] ?? "errorUnknown")}
              </p>
            ) : null}
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-slim"
              disabled={pending || newNameAr.trim() === "" || newParent === ""}
              onClick={add}
            >
              <Plus size={14} aria-hidden />
              {t("addUnit")}
            </button>
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
                  depth={0}
                  rows={rows}
                  canEdit={canEdit}
                  onDone={refresh}
                />
              ))}
            </ul>
          )
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {tree.map((root) => (
              <UnitRow key={root.id} node={root} depth={0} rows={rows} canEdit={canEdit} onDone={refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
