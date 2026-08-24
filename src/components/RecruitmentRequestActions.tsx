"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { recruitmentRequestErrorText } from "@/lib/recruitmentRequestErrors";
import { RequestActionIconGlyph } from "@/components/RequestActionIconGlyph";
import {
  availableRequestTransitions,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import {
  transitionRecruitmentRequest,
  type RecruitmentRequestActionState,
} from "@/app/[locale]/(app)/recruitment/requests/actions";

/**
 * Rejection is the one action here that cannot be walked back, so it is the
 * one that gets a colour. Everything else stays neutral: tinting several
 * icons at once turns the column into decoration and the warning stops
 * registering.
 */
function iconVariant(icon: string | undefined): string {
  return icon === "reject" ? " danger" : "";
}

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
    return <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>—</span>;
  }

  const openRule = options.find((rule) => rule.to === openTarget);

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
      {/* Icons rather than stacked text buttons, asked for directly. The
          explanation on hover is what makes that trade acceptable: the label
          names the action, the sentence says what it will actually do.
          `aria-label` carries the name for assistive tech, which never sees
          the CSS tooltip. */}
      <div className="sru-icon-action-group" style={{ flexWrap: "wrap" }}>
        {options.map((rule) => {
          const open = openTarget === rule.to;
          return (
            <button
              key={`${rule.from}->${rule.to}`}
              type="button"
              className={`sru-icon-action${iconVariant(rule.icon)}${open ? " primary" : ""}`}
              aria-label={rule.labelAr}
              aria-pressed={rule.requiresNote ? open : undefined}
              data-tooltip={
                rule.descriptionAr ? `${rule.labelAr} — ${rule.descriptionAr}` : rule.labelAr
              }
              disabled={pending}
              onClick={() => {
                setState(null);
                if (rule.requiresNote) {
                  setOpenTarget(open ? null : rule.to);
                  setNote("");
                } else {
                  run(rule.to);
                }
              }}
            >
              {rule.icon ? <RequestActionIconGlyph name={rule.icon} /> : rule.labelAr}
            </button>
          );
        })}
      </div>

      {/* Which action the open reason box belongs to. With text buttons the
          label above it said so; with icons nothing would, and rejecting when
          you meant to return for revision is not a recoverable slip. */}
      {openTarget && openRule && (
        <span style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{openRule.labelAr}</span>
      )}

      {openTarget && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            rows={2}
            value={note}
            placeholder={t("reasonPlaceholder")}
            onChange={(event) => setNote(event.target.value)}
            style={{ fontSize: 12 }}
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
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
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
