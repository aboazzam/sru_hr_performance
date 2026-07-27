"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { approveJobTitleCareerContent } from "@/app/[locale]/(app)/career-path/job-titles/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function ApproveCareerContentButton({ jobTitleId }: { jobTitleId: string }) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveJobTitleCareerContent(jobTitleId);
      if (res.status === "success") router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" disabled={isPending} onClick={handleApprove} className="sru-btn sru-btn-primary">
        {isPending ? t("approving") : t("approveButton")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
