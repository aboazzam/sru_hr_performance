"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { generateThreeSixtyFixedAssignments } from "@/app/[locale]/(app)/three-sixty/[cycleId]/actions";

export function GenerateFixedAssignmentsButton({ cycleId }: { cycleId: string }) {
  const t = useTranslations("ThreeSixtyCycleDetailPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(generateThreeSixtyFixedAssignments, null);

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="cycleId" value={cycleId} />
      <button type="submit" className="sru-btn" disabled={pending}>
        {pending ? t("generateAssignmentsSubmitting") : t("generateAssignmentsButton")}
      </button>
      {state?.status === "success" && (
        <span style={{ fontSize: 11.5, color: "var(--sru-muted)", marginInlineStart: 10 }}>
          {t("generateAssignmentsSuccess", { count: state.created })}
        </span>
      )}
      {state?.status === "error" && (
        <span role="alert" style={{ fontSize: 11.5, color: "#b91c1c", marginInlineStart: 10 }}>
          {t("generateAssignmentsError")}
        </span>
      )}
    </form>
  );
}
