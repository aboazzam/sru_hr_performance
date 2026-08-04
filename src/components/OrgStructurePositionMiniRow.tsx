"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updatePosition, deletePosition } from "@/app/[locale]/(app)/admin/org-structure/actions";
import { computeEligibleParentPositions, isRootLevelOrder } from "@/lib/orgStructurePositions";

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

interface LevelOption {
  id: string;
  level_order: number;
}

interface PositionOption {
  id: string;
  name_ar: string;
  level_id: string;
  parent_id: string | null;
}

export function OrgStructurePositionMiniRow({
  positionId,
  levelId,
  initialNameAr,
  initialNameEn,
  initialOrgUnitId,
  initialParentId,
  orgUnits,
  levels,
  positions,
  parentLabel,
}: {
  positionId: string;
  levelId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  initialOrgUnitId: string | null;
  initialParentId: string | null;
  orgUnits: OrgUnitOption[];
  levels: LevelOption[];
  positions: PositionOption[];
  parentLabel: string;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  // Real feedback (2026-07-27): the name/org-unit fields were always
  // rendered as live inputs with no distinct "this is editable" affordance,
  // making it unclear a click would let you change them. Now defaults to a
  // plain read-only view with an explicit edit (pencil) button; the inputs
  // only appear once editing is entered, closing that discoverability gap.
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [orgUnitId, setOrgUnitId] = useState(initialOrgUnitId ?? "");
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [error, setError] = useState<string | null>(null);

  const orgUnitName = orgUnits.find((u) => u.id === initialOrgUnitId)?.name_ar ?? t("positionOrgUnitNone");

  // Real feedback (2026-08-05): "اضف خاصية تغيير التبعية للمنصب" -- parent
  // was only ever settable at `addPosition` time, with no way to fix it
  // afterward. See src/lib/orgStructurePositions.ts for the shared rule
  // (and why OrgStructurePositionRow, the staffing screen's equivalent row,
  // must use the exact same logic).
  const levelOrderById = new Map(levels.map((l) => [l.id, l.level_order]));
  const ownLevelOrder = levelOrderById.get(levelId);
  const isRootLevel = isRootLevelOrder(ownLevelOrder, levels);
  const parentOptions = computeEligibleParentPositions(positionId, ownLevelOrder, levels, positions);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    has_dependents: "errorHasDependentsPosition",
    unknown: "errorUnknown",
  };

  function handleEdit() {
    setError(null);
    setNameAr(initialNameAr);
    setNameEn(initialNameEn ?? "");
    setOrgUnitId(initialOrgUnitId ?? "");
    setParentId(initialParentId ?? "");
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updatePosition(positionId, nameAr, nameEn, orgUnitId || null, isRootLevel ? null : parentId || null);
      if (res.status === "success") {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deletePositionConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deletePosition(positionId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (!isEditing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--sru-border)" }}>
        <span style={{ color: "var(--sru-muted)", fontSize: 11.5, minWidth: 80 }}>{parentLabel}</span>
        <strong style={{ fontSize: 13 }}>{initialNameAr}</strong>
        {initialNameEn && (
          <span dir="ltr" style={{ fontSize: 12, color: "var(--sru-muted)" }}>
            {initialNameEn}
          </span>
        )}
        <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>({orgUnitName})</span>
        <div className="sru-icon-action-group">
          <button type="button" onClick={handleEdit} className="sru-icon-action" title={t("editButton")} aria-label={t("editButton")}>
            <Pencil size={14} />
          </button>
          <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
            <Trash2 size={14} />
          </button>
        </div>
        {error && (
          <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </span>
        )}
      </div>
    );
  }

  // Real feedback (2026-08-05): once the parent/reporting-line select
  // joined the pre-existing name/name/org-unit fields, this was one flat,
  // unlabeled flex row -- nothing distinguished the position's own name
  // from its reporting line from its org-unit link. Rebuilt as a bordered
  // "now editing" card split into two named, individually-labeled groups
  // (see the .sru-position-edit-* rules in globals.css).
  return (
    <div className="sru-position-edit-card">
      <div className="sru-position-edit-group">
        <span className="sru-position-edit-grouplabel">{t("positionEditIdentityGroup")}</span>
        <div className="sru-position-edit-fields">
          <div className="sru-position-edit-field">
            <label htmlFor={`nameAr-${positionId}`}>{t("positionNameArLabel")}</label>
            <input id={`nameAr-${positionId}`} value={nameAr} onChange={(e) => setNameAr(e.target.value)} autoFocus />
          </div>
          <div className="sru-position-edit-field">
            <label htmlFor={`nameEn-${positionId}`}>{t("positionNameEnLabel")}</label>
            <input id={`nameEn-${positionId}`} value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
          </div>
        </div>
      </div>

      <div className="sru-position-edit-group">
        <span className="sru-position-edit-grouplabel">{t("positionEditLinksGroup")}</span>
        <div className="sru-position-edit-fields">
          <div className="sru-position-edit-field">
            <label htmlFor={`parent-${positionId}`}>{t("positionParentLabel")}</label>
            {isRootLevel ? (
              <p>{t("rootChip")}</p>
            ) : parentOptions.length === 0 ? (
              <p>{t("noParentOptions")}</p>
            ) : (
              <select id={`parent-${positionId}`} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                {parentOptions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.name_ar}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="sru-position-edit-field">
            <label htmlFor={`orgUnit-${positionId}`}>{t("positionOrgUnitLabel")}</label>
            <select id={`orgUnit-${positionId}`} value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              <option value="">{t("positionOrgUnitNone")}</option>
              {orgUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name_ar}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginTop: 10, fontSize: 12 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}

      <div className="sru-position-edit-actions">
        <button
          type="button"
          disabled={isSaving || (!isRootLevel && parentOptions.length === 0)}
          onClick={handleSave}
          className="sru-icon-action primary"
          title={t("saveButton")}
          aria-label={t("saveButton")}
        >
          <Check size={14} />
        </button>
        <button type="button" disabled={isSaving} onClick={handleCancel} className="sru-icon-action" title={t("cancelButton")} aria-label={t("cancelButton")}>
          <X size={14} />
        </button>
        <span className="sru-position-edit-actions-divider" aria-hidden="true" />
        <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
