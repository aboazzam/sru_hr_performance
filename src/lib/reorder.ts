/**
 * Moves `draggedId` to sit at `targetId`'s current position within `ids`,
 * preserving the relative order of everything else. Pure so the
 * drag-and-drop UI's actual reordering math can be unit-tested without a
 * browser drag simulation — the level-reorder feature (2026-07-25) is the
 * first drag-and-drop interaction in this app.
 */
export function reorderIds(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids;
  const fromIndex = ids.indexOf(draggedId);
  const toIndex = ids.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return ids;
  const next = ids.slice();
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, draggedId);
  return next;
}
