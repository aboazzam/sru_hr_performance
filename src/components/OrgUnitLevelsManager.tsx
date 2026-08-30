"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * The org-structure levels, managed from the org units screen.
 *
 * They used to live on `/admin/org-structure`, which is now just the uploaded
 * chart image. The levels themselves could not go with it: every unit's
 * `level_id` and every position's `level_id` point at them, so deleting their
 * only editor would have left a required field with no way to fill it.
 *
 * The cards, the drag-to-reorder list and the add form are the SAME
 * components that screen used, passed in as `children` rather than rewritten —
 * a second implementation of level editing is exactly the kind of drift this
 * project has been bitten by before.
 */
export function OrgUnitLevelsManager({
  children,
  addForm,
  count,
}: {
  children: ReactNode;
  addForm: ReactNode;
  count: number;
}) {
  const t = useTranslations("OrgUnitsPage");
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Collapsed by default, like the classifications panel beside it: the
          levels are set up once and then rarely touched. */}
      <button type="button" className="sru-btn sru-btn-slim" onClick={() => setOpen((v) => !v)}>
        {open ? t("levelsHide") : t("levelsShow", { count })}
      </button>
      {open ? (
        <div className="sru-card" style={{ padding: "12px 14px", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5, flex: 1, lineHeight: 1.7 }}>
              {t("levelsNote")}
            </p>
            {addForm}
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
