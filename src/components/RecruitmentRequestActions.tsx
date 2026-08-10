"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { recruitmentRequestErrorText } from "@/lib/recruitmentRequestErrors";
import {
  availableRequestTransitions,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import {
  transitionRecruitmentRequest,
  type RecruitmentRequestActionState,
} from "@/app/[locale]/(app)/recruitment/requests/actions";

/**
 * The action buttons for one request row. Which buttons exist comes straight
 * from the transition table — this component holds no workflow knowledge of
 * its own, so a rule added in `recruitmentWorkflow.ts` shows up here with no
 * change to this file.
 *
 * Only transitions the caller may actually perform are rendered (the
 * project's "no disabled button for a permission you don't hold" rule).
 * Transitions whose *form* preconditions are unmet — a reason not yet typed
 * — ARE rendered, because the caller can still satisfy them; the reason box
 * appears on click.
 *
 * The server re-reads the current status and re-runs the same guard, so a
 * button rendered from stale props cannot force an illegal transition.
 */
export function RecruitmentRequestActions({
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
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Transitions flagged `statusAdjacent` render beside the status instead
  // (RequestStatusCell), so they are excluded here rather than duplicated.
  const options = availableRequestTransitions(status, permissions).filter(
    (rule) => !rule.statusAdjacent
  );
  if (options.length === 0) {
    return <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>—</span>;
  }

  function run(toStatus: string, reason?: string) {
    startTransition(async () => {
      const result = await transitionRecruitmentRequest({ requestId, toStatus, note: reason });
      setState(result);
      if (result.status === "success") {
        setOpenTarget(null);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((rule) => (
          <button
            key={rule.to}
            type="button"
            className="sru-btn"
            disabled={pending}
            onClick={() => {
              setState(null);
              if (rule.requiresNote) {
                setOpenTarget(openTarget === rule.to ? null : rule.to);
                setNote("");
              } else {
                run(rule.to);
              }
            }}
          >
            {rule.labelAr}
          </button>
        ))}
      </div>

      {openTarget && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            rows={2}
            value={note}
            placeholder={t("reasonPlaceholder")}
            onChange={(event) => setNote(event.target.value)}
            style={{ fontSize: 13 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="sru-btn sru-btn-primary"
              // The reason is mandatory here; the server enforces it too.
              disabled={pending || note.trim() === ""}
              onClick={() => run(openTarget, note)}
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              className="sru-btn"
              disabled={pending}
              onClick={() => {
                setOpenTarget(null);
                setNote("");
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {state?.status === "error" && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 12 }}>
          {/* Two error families reach here: refusals from the workflow guard,
              which carry their own Arabic wording, and action-level failures.
              The latter used to fall through to a bare "تعذر إتمام العملية" —
              reported live when a stale page tried to submit a request that
              no longer existed, leaving no hint that reloading would help.
              The mapping lives in a shared helper because RequestStatusCell
              renders the same failures beside the status. */}
          {recruitmentRequestErrorText(state.message, t)}

        </span>
      )}
    </div>
  );
}
