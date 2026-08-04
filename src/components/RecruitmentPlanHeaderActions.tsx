"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Network, CheckCircle2 } from "lucide-react";
import {
  importVacantPositionsIntoPlan,
  approveRecruitmentPlan,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateItem",
  unknown: "errorUnknown",
};

/**
 * The two plan-level actions: pull every genuinely vacant org-chart position
 * into the plan, and approve the plan. Import is `prepare`; approve is
 * `approve` (checked server-side in the action, since RLS gates the row, not
 * the column).
 */
export function RecruitmentPlanHeaderActions({
  planId,
  canPrepare,
  canApprove,
  isApproved,
}: {
  planId: string;
  canPrepare: boolean;
  canApprove: boolean;
  isApproved: boolean;
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);

  function runImport() {
    setState(null);
    startTransition(async () => {
      const result = await importVacantPositionsIntoPlan(planId);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  function runApprove() {
    if (!window.confirm(t("approveConfirm"))) return;
    setState(null);
    startTransition(async () => {
      const result = await approveRecruitmentPlan(planId);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {canPrepare && (
        <button type="button" className="sru-btn" disabled={pending} onClick={runImport}>
          <Network size={15} aria-hidden style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
          {t("importVacantPositions")}
        </button>
      )}
      {canApprove && !isApproved && (
        <button type="button" className="sru-btn sru-btn-primary" disabled={pending} onClick={runApprove}>
          <CheckCircle2 size={15} aria-hidden style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
          {t("approvePlan")}
        </button>
      )}
      {isApproved && <span className="pill">{t("alreadyApproved")}</span>}

      {state?.status === "error" && (
        <span role="alert" className="text-sm text-red-600">
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </span>
      )}
      {state?.status === "success" && state.createdCount !== undefined && (
        <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
          {t("importDone", { created: state.createdCount, skipped: state.skippedCount ?? 0 })}
        </span>
      )}
      {state?.status === "success" && state.createdCount === undefined && (
        <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
          {t("planApproved")}
        </span>
      )}
    </div>
  );
}
