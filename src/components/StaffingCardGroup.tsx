"use client";

import { useState, useTransition, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reorderOrgUnits } from "@/app/[locale]/(app)/org-units/actions";
import { reorderIds } from "@/lib/reorder";

interface CardGroupItem {
  id: string;
  node: ReactNode;
  /** False for a card that shares no real org_units parent with its
   *  visible neighbours here (e.g. a flat card from an unrelated branch,
   *  merged into the same list purely for display) -- it renders with no
   *  grip and never participates in a drop. */
  draggable: boolean;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * Drag-and-drop reordering directly on the staffing screen -- 2026-09-03:
 * "أضفها" (confirmed after asking, since this screen had deliberately
 * carried no structural editing since the 2026-08-31 simplification down to
 * assign/unassign only). Persists to the exact same `org_units.sort_order`
 * column and `reorderOrgUnits` action /org-units already writes, so a drag
 * here and a drag there are the same fact, just edited from two screens.
 *
 * Unlike `OrgUnitSiblingsList` (org-units' own tree, where every list is
 * already one real sibling group), a card list *here* can mix units that
 * share no real parent at all -- the top-level list merges "رئيس الجامعة"'s
 * real children with unrelated flat cards from other branches, and
 * `reorderOrgUnits` can only ever touch ONE sibling group at a time. Each
 * item therefore carries its own `draggable` flag; a non-draggable item
 * renders with no grip and is invisible to the drag logic entirely -- the
 * new order is computed by extracting just the draggable ids (in their
 * current relative order) and reordering *within that subset*, so a
 * flat card sitting between two draggable ones never breaks the drag.
 */
export function StaffingCardGroup({ parentId, items }: { parentId: string | null; items: CardGroupItem[] }) {
  const t = useTranslations("OrgStructureStaffingPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    setDragOverId(null);
    const dragged = draggedId;
    setDraggedId(null);
    if (!dragged || dragged === targetId) return;

    const draggableOrder = items.filter((item) => item.draggable).map((item) => item.id);
    const nextOrder = reorderIds(draggableOrder, dragged, targetId);
    if (nextOrder === draggableOrder) return;

    setError(null);
    startTransition(async () => {
      const res = await reorderOrgUnits(parentId, nextOrder);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginBottom: 6 }}>
          {t(errorKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {items.map((item) =>
        !item.draggable ? (
          <div key={item.id}>{item.node}</div>
        ) : (
          <div
            key={item.id}
            draggable={!isPending}
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverId !== item.id) setDragOverId(item.id);
            }}
            onDragLeave={() => setDragOverId((current) => (current === item.id ? null : current))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(item.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            className={`sru-draggable-item${draggedId === item.id ? " dragging" : ""}${dragOverId === item.id ? " drag-over" : ""}`}
            style={{ alignItems: "center" }}
          >
            <div className="sru-drag-handle" style={{ marginTop: 0 }} title={t("dragToReorder")} aria-label={t("dragToReorder")}>
              <GripVertical size={14} />
            </div>
            <div className="sru-drag-handle-col">{item.node}</div>
          </div>
        )
      )}
    </>
  );
}
