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
  /** The card's real `org_units.parent_id` -- null renders with no grip and
   *  never participates in a drop. A group of one (no other visible item
   *  shares this id) is pointless to drag, so the caller is expected to
   *  pass null for those too, not just for parentless cards. */
  groupId: string | null;
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
 * Unlike `OrgUnitSiblingsList` (org-units' own tree, where every rendered
 * list is already one real sibling group), a card list *here* can mix
 * SEVERAL real sibling groups at once -- the top-level list showed this
 * live (2026-09-04): "رئيس الجامعة"'s own children are one group, but
 * several other visible cards (the "رئيس الجامعة" flat card itself,
 * "إدارة المراجعة الداخلية", "أمانة مجلس الجامعة", ...) turned out to be a
 * SECOND real group -- all direct children of "مجلس الجامعة" -- that an
 * earlier version of this component never recognized as draggable at all.
 * `reorderOrgUnits` can only ever touch one group per call, so each item
 * carries its own `groupId` (its real parent id, or null when it has no
 * group-mate visible here); a drop is only honoured between two items
 * sharing the same groupId, and the persisted order is computed from just
 * that group's own ids (in their current relative order), so unrelated
 * cards interleaved between them never disturb the drag.
 */
export function StaffingCardGroup({ items }: { items: CardGroupItem[] }) {
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

    const draggedItem = items.find((item) => item.id === dragged);
    const targetItem = items.find((item) => item.id === targetId);
    // A drop only makes sense between two cards that share a real parent --
    // dropping "إدارة التميز المؤسسي" (رئيس الجامعة's child) onto "أمانة
    // مجلس الجامعة" (مجلس الجامعة's child) has no coherent meaning.
    if (!draggedItem?.groupId || draggedItem.groupId !== targetItem?.groupId) return;

    const groupOrder = items.filter((item) => item.groupId === draggedItem.groupId).map((item) => item.id);
    const nextOrder = reorderIds(groupOrder, dragged, targetId);
    if (nextOrder === groupOrder) return;

    setError(null);
    startTransition(async () => {
      const res = await reorderOrgUnits(draggedItem.groupId, nextOrder);
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
        item.groupId === null ? (
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
