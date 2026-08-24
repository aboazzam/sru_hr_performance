"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Network } from "lucide-react";
import {
  importVacantPositionsIntoPlan,
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
 * Pulls every genuinely vacant org-chart position into the plan.
 *
 * The plan's approve button used to live here too, as a flat "set status to
 * approved" action. It was removed on 2026-08-07 when the approval cycle
 * landed: approval is now one guarded transition among many
 * (`recruitmentWorkflow.ts`), performed on the dedicated approval screen,
 * where the mandatory preconditions — finance has reviewed, and no request
 * is still undecided — are actually enforced. Keeping a second, unguarded
 * path to `approved` would have made the whole cycle bypassable from the
 * plan header.
 */
export function RecruitmentPlanHeaderActions({
  planId,
  canPrepare,
}: {
  planId: string;
  canPrepare: boolean;
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);

  if (!canPrepare) return null;

  function runImport() {
    setState(null);
    startTransition(async () => {
      const result = await importVacantPositionsIntoPlan(planId);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {/* Primary, like "add a new item" beside it: both add items to the plan
          and are equally the point of that row. One filled and one outlined
          read as a main action and a lesser one, which is not the case. */}
      <button type="button" className="sru-btn sru-btn-primary" disabled={pending} onClick={runImport}>
        <Network size={15} aria-hidden style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
        {t("importVacantPositions")}
      </button>

      {state?.status === "error" && (
        <span role="alert" className="text-sm text-red-600">
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </span>
      )}
      {state?.status === "success" && state.createdCount !== undefined && (
        <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 12 }}>
          {t("importDone", { created: state.createdCount, skipped: state.skippedCount ?? 0 })}
        </span>
      )}
    </div>
  );
}
