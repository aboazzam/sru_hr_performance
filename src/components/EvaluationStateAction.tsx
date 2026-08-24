"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { transitionEvaluation } from "@/app/[locale]/(app)/evaluations/[id]/actions";
import { evaluationStateLabels, nextEvaluationState, type EvaluationState } from "@/lib/vpra";

export function EvaluationStateAction({
  evaluationId,
  currentState,
}: {
  evaluationId: string;
  currentState: EvaluationState;
}) {
  const t = useTranslations("EvaluationDetailPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { status: "success" } | { status: "error"; message: string } | null
  >(null);

  const target = nextEvaluationState(currentState);

  if (!target) {
    return (
      <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("noFurtherTransition")}</p>
    );
  }

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalidInput",
    unauthenticated: "errorUnauthenticated",
    not_found: "errorNotFound",
    forbidden: "errorForbidden",
    unknown: "errorUnknown",
  };

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const res = await transitionEvaluation(evaluationId);
            if (res.status === "success") {
              setResult({ status: "success" });
              router.refresh();
            } else {
              setResult({ status: "error", message: res.message });
            }
          });
        }}
        className="sru-btn sru-btn-primary"
      >
        {isPending
          ? t("advancing")
          : t("advanceTo", { state: evaluationStateLabels[target] })}
      </button>

      {result?.status === "success" && (
        <p role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 12, marginTop: 8 }}>
          {t("advanceSuccess")}
        </p>
      )}
      {result?.status === "error" && (
        <p role="alert" style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>
          {t(errorMessageKeys[result.message] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
