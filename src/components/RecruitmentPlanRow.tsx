"use client";

import { useRouter, Link } from "@/i18n/navigation";
import { planStatusLabel } from "@/lib/recruitmentWorkflow";

/**
 * One plan in the list — the whole row opens it.
 *
 * Asked for directly: "ألغِ زر فتح الخطة، وبمجرد المرور على الخطة تتحول
 * الإشارة وبمجرد الضغط تنفتح الخطة." A row that navigates needs to SAY so
 * before it is clicked, so the pointer and a hover tint arrive together —
 * the cursor alone is easy to miss on a wide table.
 *
 * The plan's name stays a real `<Link>` even though the row handles the
 * click. That is not redundancy:
 *   - keyboard users reach it by Tab and open it with Enter, which a bare
 *     `onClick` on a `<tr>` gives nobody;
 *   - screen readers announce a link rather than an inert row;
 *   - Ctrl/⌘-click and middle-click open a new tab, which `router.push`
 *     cannot do — a plain JS row would silently take that away.
 * The row handler therefore ignores clicks that already landed on a link or
 * a button, so nothing fires twice and any control added to this row later
 * keeps working.
 */
export function RecruitmentPlanRow({
  planId,
  nameAr,
  notes,
  planYear,
  status,
  headcount,
}: {
  planId: string;
  nameAr: string;
  notes: string | null;
  planYear: number;
  status: string;
  headcount: number;
}) {
  const router = useRouter();
  const href = `/recruitment/plan/${planId}`;

  return (
    <tr
      className="sru-row-link"
      onClick={(event) => {
        // Let a real link or button do its own job.
        if ((event.target as HTMLElement).closest("a, button")) return;
        router.push(href);
      }}
    >
      <td>
        <Link href={href} className="sru-row-link-title">
          {nameAr}
        </Link>
        {notes && (
          <div style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>{notes}</div>
        )}
      </td>
      <td className="sru-en">{planYear}</td>
      <td>
        <span className="pill">{planStatusLabel(status)}</span>
      </td>
      <td className="sru-en">{headcount}</td>
    </tr>
  );
}
