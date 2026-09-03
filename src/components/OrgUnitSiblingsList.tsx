"use client";

import { useState, useTransition, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reorderOrgUnits } from "@/app/[locale]/(app)/org-units/actions";
import { reorderIds } from "@/lib/reorder";

interface SiblingListItem {
  id: string;
  node: ReactNode;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * Drag-and-drop reordering for one sibling group of org units -- either the
 * roots, or every direct child of one parent unit. Same drag mechanics as
 * `OrgStructureLevelsList` (2026-07-25's flat-list reorder for
 * org_structure_levels), duplicated rather than shared: that component's
 * chrome is small and this one needs a `parentId` to know which sibling
 * group `reorderOrgUnits` should touch, plus centered (not top-aligned)
 * handle placement to match a single-line unit row instead of a taller
 * multi-field edit card.
 *
 * 2026-09-02: "اضف خاصية التحريك بحيث يمكن للمستخدم تغيير الترتيب" --
 * "كلاهما، ونفّذها في صفحة الوحدات التنظيمية" (both child-units-within-a-
 * card and the top-level cards, built here since this is where the
 * hierarchy itself is edited). Rendered recursively: `OrgUnitsManager`
 * wraps both the root list and every node's own `children` list with one
 * of these, so dragging works at any depth, one sibling group at a time --
 * dragging never crosses into a different parent's group, since that's
 * already a distinct operation (the existing "parent" field).
 */
export function OrgUnitSiblingsList({
  parentId,
  items,
}: {
  parentId: string | null;
  items: SiblingListItem[];
}) {
  const t = useTranslations("OrgUnitsPage");
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

    const currentOrder = items.map((item) => item.id);
    const nextOrder = reorderIds(currentOrder, dragged, targetId);
    if (nextOrder === currentOrder) return;

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

  if (items.length === 0) return null;

  // Every `item.node` is itself a `<UnitRow>`, which renders a `<li>` -- this
  // component is always used directly inside the surrounding `<ul>` (the
  // root list, or a node's own children list), so it returns `<li>`-shaped
  // siblings via a fragment rather than wrapping them in a `<div>`, which
  // would be invalid as a direct child of `<ul>`.
  return (
    <>
      {error && (
        <li role="alert" className="text-sm text-red-600" style={{ listStyle: "none", padding: "2px 0 6px" }}>
          {t(errorKeys[error] ?? "errorUnknown")}
        </li>
      )}
      {items.length === 1
        ? items[0].node
        : items.map((item) => (
            <li
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
              style={{ alignItems: "center", listStyle: "none" }}
            >
              <div className="sru-drag-handle" style={{ marginTop: 0 }} title={t("dragToReorder")} aria-label={t("dragToReorder")}>
                <GripVertical size={14} />
              </div>
              <div className="sru-drag-handle-col">{item.node}</div>
            </li>
          ))}
    </>
  );
}
