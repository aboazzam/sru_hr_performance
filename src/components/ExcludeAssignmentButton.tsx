"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { excludeThreeSixtyAssignment } from "@/app/[locale]/(app)/three-sixty/[cycleId]/actions";

export function ExcludeAssignmentButton({ assignmentId, label }: { assignmentId: string; label: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(excludeThreeSixtyAssignment, null);

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(label)) e.preventDefault();
      }}
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button type="submit" className="sru-icon-action" disabled={pending} aria-label={label} title={label}>
        ✕
      </button>
    </form>
  );
}
