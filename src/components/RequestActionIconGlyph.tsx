"use client";

import {
  BadgeCheck,
  ClipboardCheck,
  CornerUpLeft,
  RotateCw,
  Send,
  Undo2,
  X,
  type LucideProps,
} from "lucide-react";
import { type RequestActionIcon } from "@/lib/recruitmentWorkflow";

/**
 * The one place a request action's icon NAME becomes a drawn glyph.
 *
 * The transition table stays free of React (it is pure data, unit-tested, and
 * imported by server code too), so it carries a name and this maps it. Lucide
 * only, per the project's icon rule.
 *
 * Every name in the union appears here, and the map is typed as a total
 * Record — a new icon name therefore fails to compile until it is drawn,
 * rather than rendering an empty button nobody notices.
 */
const GLYPHS: Record<RequestActionIcon, React.ComponentType<LucideProps>> = {
  // Sending the request onward to the next desk.
  send: Send,
  // Same journey, second time — the arrow says "again", which is the whole
  // difference between raising and re-raising.
  resend: RotateCw,
  // A checked-off form: HR's review is finished, not the request itself.
  reviewed: ClipboardCheck,
  // A badge, not a bare tick, so final approval does not read like one more
  // step completed among several.
  approve: BadgeCheck,
  reject: X,
  // Pointing back the way it came: returned to its author, not rejected.
  returnForRevision: CornerUpLeft,
  undo: Undo2,
};

export function RequestActionIconGlyph({
  name,
  size = 15,
}: {
  name: RequestActionIcon;
  size?: number;
}) {
  const Glyph = GLYPHS[name];
  return <Glyph size={size} aria-hidden />;
}
