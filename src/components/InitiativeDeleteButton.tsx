"use client";

import { useActionState, startTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  deleteInitiativeAndReturn,
  type InitiativeCardState,
} from "@/app/[locale]/(app)/initiatives/[id]/actions";

/**
 * Delete the initiative from its own page.
 *
 * The action itself redirects back to the plan once the row is gone. Doing it
 * client-side did NOT work and the reason is worth keeping: `revalidatePath`
 * re-renders this page as "initiative not found" and unmounts the button
 * before any success effect can navigate, so the reader was left sitting on a
 * dead URL (seen live). A server-side redirect happens before that
 * re-render, so nothing can race it.
 */
export function InitiativeDeleteButton({ initiativeId, planId }: { initiativeId: string; planId: string }) {
  const t = useTranslations("InitiativePage");
  const locale = useLocale();
  const [, formAction] = useActionState<InitiativeCardState, FormData>(deleteInitiativeAndReturn, null);

  return (
    <form
      action={(formData) => {
        if (!window.confirm(t("deleteInitiativeConfirm"))) return;
        startTransition(() => formAction(formData));
      }}
    >
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className="sru-icon-action"
        title={t("deleteInitiative")}
        aria-label={t("deleteInitiative")}
      >
        <Trash2 size={15} aria-hidden />
      </button>
    </form>
  );
}
