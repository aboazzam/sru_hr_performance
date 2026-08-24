"use client";

import { useActionState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reviewEmployeeApproval, type ReviewEmployeeApprovalState } from "@/app/[locale]/(app)/employees/actions";

/** Approve/reject buttons for one pending employee-data submission (2026-07-25 approval workflow). */
export function EmployeeApprovalActions({ profileId }: { profileId: string }) {
  const t = useTranslations("EmployeesPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ReviewEmployeeApprovalState, FormData>(
    reviewEmployeeApproval,
    null
  );

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <input type="hidden" name="profileId" value={profileId} />
      <button
        type="submit"
        name="decision"
        value="approved"
        disabled={pending}
        className="sru-icon-action primary"
        title={t("approveButton")}
        aria-label={t("approveButton")}
      >
        <Check size={15} />
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="sru-icon-action danger"
        title={t("rejectButton")}
        aria-label={t("rejectButton")}
      >
        <X size={15} />
      </button>
      {state?.status === "error" && (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 10.5 }}>
          {t("reviewError")}
        </span>
      )}
    </form>
  );
}
