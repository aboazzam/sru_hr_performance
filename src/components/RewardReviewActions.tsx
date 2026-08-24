"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reviewReward } from "@/app/[locale]/(app)/rewards/actions";

export function RewardReviewActions({ rewardId }: { rewardId: string }) {
  const t = useTranslations("RewardsPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalidInput",
    unauthenticated: "errorUnauthenticated",
    not_found: "errorNotFound",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await reviewReward(rewardId, decision);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => decide("approved")}
          className="sru-btn sru-btn-primary"
          style={{ fontSize: 12, padding: "6px 12px" }}
        >
          {t("approve")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => decide("rejected")}
          className="sru-btn"
          style={{ fontSize: 12, padding: "6px 12px" }}
        >
          {t("reject")}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "#dc2626", fontSize: 11.5, marginTop: 4 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
