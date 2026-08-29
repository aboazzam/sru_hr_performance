"use client";

import { Link } from "@/i18n/navigation";
import { RowLink } from "@/components/RowLink";
import { planStatusLabelFor } from "@/lib/recruitmentWorkflow";
import { planListStatusLabel, type IntakeWindowState } from "@/lib/recruitmentPlanWindows";

/** One plan in the list — the whole row opens it (see {@link RowLink}). */
export function RecruitmentPlanRow({
  planId,
  nameAr,
  notes,
  planYear,
  status,
  intakeState,
  financeReviewed,
  headcount,
}: {
  planId: string;
  nameAr: string;
  notes: string | null;
  planYear: number;
  status: string;
  /** حالة نافذة الاستقبال اليوم — تُحسب في الخادم بتوقيت العرض. */
  intakeState: IntakeWindowState;
  /** Finance has stamped its review — changes what `finance_review` reads as. */
  financeReviewed: boolean;
  headcount: number;
}) {
  const href = `/recruitment/plan/${planId}`;

  return (
    <RowLink href={href}>
      <td>
        <Link href={href} className="sru-row-link-title">
          {nameAr}
        </Link>
        {notes && (
          <div style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 2 }}>{notes}</div>
        )}
      </td>
      <td className="sru-en">{planYear}</td>
      <td>
        <span className="pill">
          {planListStatusLabel(status, intakeState, planStatusLabelFor(status, { financeReviewed }))}
        </span>
      </td>
      <td className="sru-en">{headcount}</td>
    </RowLink>
  );
}
