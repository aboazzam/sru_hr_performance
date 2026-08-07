"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Undo2 } from "lucide-react";
import { recruitmentRequestErrorText } from "@/lib/recruitmentRequestErrors";
import {
  availableRequestTransitions,
  requestStatusLabel,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import {
  transitionRecruitmentRequest,
  type RecruitmentRequestActionState,
} from "@/app/[locale]/(app)/recruitment/requests/actions";

/**
 * The status cell: the status itself, plus any transition the table marks
 * `statusAdjacent` rendered as a small icon right beside it.
 *
 * Today that is only "إخراج من الخطة" — requested directly, because the
 * status now reads "بانتظار الاعتماد" and taking the item back out of the
 * plan is a correction OF that status, not one of the forward actions. The
 * set comes from `availableRequestTransitions`, so this component holds no
 * workflow knowledge of its own and a rule added to the table appears here
 * automatically; the Server Action re-reads the true status and re-runs the
 * same guard, so an icon rendered from stale props cannot force anything.
 */
export function RequestStatusCell({
  requestId,
  status,
  permissions,
}: {
  requestId: string;
  status: string;
  permissions: RecruitmentPermissions;
}) {
  const t = useTranslations("RecruitmentRequestsPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentRequestActionState | null>(null);

  const adjacent = availableRequestTransitions(status, permissions).filter((rule) => rule.statusAdjacent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className="pill">{requestStatusLabel(status)}</span>
        {adjacent.map((rule) => (
          <button
            key={rule.to}
            type="button"
            className="sru-icon-action"
            title={rule.labelAr}
            aria-label={rule.labelAr}
            disabled={pending}
            onClick={() => {
              setState(null);
              startTransition(async () => {
                const result = await transitionRecruitmentRequest({ requestId, toStatus: rule.to });
                setState(result);
                if (result.status === "success") router.refresh();
              });
            }}
          >
            <Undo2 size={15} aria-hidden />
          </button>
        ))}
      </div>

      {state?.status === "error" && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 12 }}>
          {recruitmentRequestErrorText(state.message, t)}
        </span>
      )}
    </div>
  );
}
