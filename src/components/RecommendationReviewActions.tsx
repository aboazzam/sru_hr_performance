"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reviewRecommendation } from "@/app/[locale]/(app)/recommendations/actions";

export function RecommendationReviewActions({ recommendationId }: { recommendationId: string }) {
  const t = useTranslations("RecommendationsPage");
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
      const res = await reviewRecommendation(recommendationId, decision);
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
          style={{ fontSize: 13, padding: "6px 12px" }}
        >
          {t("approve")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => decide("rejected")}
          className="sru-btn"
          style={{ fontSize: 13, padding: "6px 12px" }}
        >
          {t("reject")}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
