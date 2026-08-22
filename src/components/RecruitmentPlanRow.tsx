"use client";

import { Link } from "@/i18n/navigation";
import { RowLink } from "@/components/RowLink";
import { planStatusLabelFor } from "@/lib/recruitmentWorkflow";

/** One plan in the list — the whole row opens it (see {@link RowLink}). */
export function RecruitmentPlanRow({
  planId,
  nameAr,
  notes,
  planYear,
  status,
  financeReviewed,
  headcount,
}: {
  planId: string;
  nameAr: string;
  notes: string | null;
  planYear: number;
  status: string;
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
          <div style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>{notes}</div>
        )}
      </td>
      <td className="sru-en">{planYear}</td>
      <td>
        <span className="pill">{planStatusLabelFor(status, { financeReviewed })}</span>
      </td>
      <td className="sru-en">{headcount}</td>
    </RowLink>
  );
}
