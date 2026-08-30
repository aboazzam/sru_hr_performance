"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Trash2, Save } from "lucide-react";
import { AddFormDialog } from "@/components/AddFormDialog";
import {
  createClassification,
  updateClassification,
  deleteClassification,
  type ClassificationActionState,
} from "@/app/[locale]/(app)/org-units/classification-actions";
import type { OrgUnitClassification } from "@/lib/orgUnitTypes";

const errorKeys: Record<string, string> = {
  invalid_input: "classErrorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "classErrorDuplicate",
  in_use: "classErrorInUse",
  unknown: "errorUnknown",
};

type Table = "org_unit_kinds" | "org_unit_types";

function ClassificationRow({
  table,
  item,
  canEdit,
  onDone,
}: {
  table: Table;
  item: OrgUnitClassification;
  canEdit: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [nameAr, setNameAr] = useState(item.nameAr);
  const [nameEn, setNameEn] = useState(item.nameEn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = nameAr !== item.nameAr || nameEn !== (item.nameEn ?? "");

  function run(fn: () => Promise<ClassificationActionState>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") onDone();
      else setError(result.message);
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--sru-border)",
        flexWrap: "wrap",
      }}
    >
      {canEdit ? (
        <>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} style={{ width: 150 }} />
          <input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} style={{ width: 150 }} />
        </>
      ) : (
        <span style={{ minWidth: 150 }}>
          {item.nameAr}
          {item.nameEn ? <span className="sru-name-en">{item.nameEn}</span> : null}
        </span>
      )}
      <span style={{ color: "var(--sru-muted)", fontSize: 11.5, flex: 1 }}>
        {t("classUsage", { count: item.usageCount })}
      </span>
      {canEdit ? (
        <>
          <button
            type="button"
            className="sru-icon-action"
            title={t("saveButton")}
            aria-label={t("saveButton")}
            disabled={pending || !dirty || nameAr.trim() === ""}
            onClick={() => run(() => updateClassification({ table, id: item.id, nameAr, nameEn }))}
          >
            <Save size={14} aria-hidden />
          </button>
          {/* Disabled, not hidden, while units still carry it: a missing
              button reads as a missing feature, a disabled one with a reason
              reads as a rule. */}
          <button
            type="button"
            className="sru-icon-action danger"
            title={item.usageCount > 0 ? t("classErrorInUse") : t("deleteButton")}
            aria-label={t("deleteButton")}
            disabled={pending || item.usageCount > 0}
            onClick={() => {
              if (!window.confirm(t("classDeleteConfirm"))) return;
              run(() => deleteClassification({ table, id: item.id }));
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
  );
}

function ClassificationList({
  table,
  heading,
  note,
  items,
  canEdit,
}: {
  table: Table;
  heading: string;
  note: string;
  items: OrgUnitClassification[];
  canEdit: boolean;
}) {
  const t = useTranslations("OrgUnitsPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createClassification({ table, nameAr, nameEn });
      if (result.status === "success") {
        setNameAr("");
        setNameEn("");
        dialogRef.current?.close();
        refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="sru-card" style={{ padding: "12px 14px", flex: "1 1 320px", minWidth: 300 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>{heading}</h3>
        {canEdit ? (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("classAdd")}
            heading={heading}
            closeLabel={t("closeButton")}
            triggerClassName="sru-btn sru-btn-slim"
          >
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor={`new-${table}-ar`}>{t("fieldNameAr")}</label>
              <input id={`new-${table}-ar`} value={nameAr} required onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor={`new-${table}-en`}>{t("fieldNameEn")}</label>
              <input id={`new-${table}-en`} value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} />
            </div>
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                {t(errorKeys[error] ?? "errorUnknown")}
              </p>
            ) : null}
            <div className="sru-form-submitrow">
              <button
                type="button"
                className="sru-btn sru-btn-primary sru-btn-slim"
                disabled={pending || nameAr.trim() === ""}
                onClick={add}
              >
                <Plus size={14} aria-hidden />
                {t("classAdd")}
              </button>
            </div>
          </AddFormDialog>
        ) : null}
      </div>
      <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 8, lineHeight: 1.7 }}>{note}</p>
      {items.map((item) => (
        <ClassificationRow key={item.id} table={table} item={item} canEdit={canEdit} onDone={refresh} />
      ))}
    </div>
  );
}

/**
 * The two classification lists, editable in place.
 *
 * `kind` was a Postgres ENUM until 20260830000002, so adding a value like
 * "قسم" meant writing a migration. Asked for on 2026-08-30 — "نريد التصنيف
 * يكون ديناميك بحيث استطيع اضافة تصنيف" — these are ordinary rows now and
 * this is the screen that owns them.
 */
export function OrgUnitClassificationsManager({
  kinds,
  types,
  canEdit,
}: {
  kinds: OrgUnitClassification[];
  types: OrgUnitClassification[];
  canEdit: boolean;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Collapsed by default: the classifications are set up once and then
          rarely touched, so they should not push the units themselves down
          the page every visit. */}
      <button type="button" className="sru-btn sru-btn-slim" onClick={() => setOpen((v) => !v)}>
        {open ? t("classHide") : t("classShow")}
      </button>
      {open ? (
        <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          <ClassificationList
            table="org_unit_kinds"
            heading={t("fieldKind")}
            note={t("kindNote")}
            items={kinds}
            canEdit={canEdit}
          />
          <ClassificationList
            table="org_unit_types"
            heading={t("fieldType")}
            note={t("typeNote")}
            items={types}
            canEdit={canEdit}
          />
        </div>
      ) : null}
    </div>
  );
}
