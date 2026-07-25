"use client";

import { useState, useTransition, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reorderLevels } from "@/app/[locale]/(app)/admin/org-structure/actions";
import { reorderIds } from "@/lib/reorder";

interface LevelListItem {
  id: string;
  node: ReactNode;
}

/**
 * Drag-and-drop reordering for the levels list (2026-07-25 request: levels
 * only ever appended in insertion order, with no way to fix a mistake after
 * the fact — "أريد أن يكون لي حرية تغيير الترتيب بخاصية السحب والافلات").
 * Pure DnD chrome: each level's already-built `OrgStructureLevelCard`
 * element is passed in as-is (built server-side by the page, same trick
 * GroupTabs/ProfileTabs already use) — this component only owns the drag
 * gesture and the reorder call.
 *
 * No optimistic local reordering: a drop calls `reorderLevels` then
 * `router.refresh()`, matching every other write in this app's convention
 * of re-fetching from the server rather than assuming the write succeeded.
 */
export function OrgStructureLevelsList({ items }: { items: LevelListItem[] }) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

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
      const res = await reorderLevels(nextOrder);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div>
      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginBottom: 10 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      {items.map((item) => (
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
        >
          <div className="sru-drag-handle" title={t("dragToReorder")} aria-label={t("dragToReorder")}>
            <GripVertical size={16} />
          </div>
          <div className="sru-drag-handle-col">{item.node}</div>
        </div>
      ))}
    </div>
  );
}
