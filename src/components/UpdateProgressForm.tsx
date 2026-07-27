"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { updateProgress, type UpdateProgressState } from "@/app/[locale]/(app)/kpis/actions";

export function UpdateProgressForm({
  nodeType,
  id,
  currentActualValue,
  unitAr,
}: {
  nodeType: "sub_goal" | "target";
  id: string;
  currentActualValue: number | null;
  unitAr: string;
}) {
  const t = useTranslations("KpisPage");
  const [state, formAction, pending] = useActionState<UpdateProgressState, FormData>(updateProgress, null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="hidden" name="nodeType" value={nodeType} />
      <input type="hidden" name="id" value={id} />
      <input
        type="number"
        name="actualValue"
        step="0.01"
        defaultValue={currentActualValue ?? undefined}
        aria-label={t("updateProgressLabel")}
        style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)" }}
      />
      <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>{unitAr}</span>
      <button type="submit" disabled={pending} className="sru-btn" style={{ fontSize: 12, padding: "4px 10px" }}>
        {t("updateProgressButton")}
      </button>
      {state?.status === "error" && (
        <span role="alert" style={{ fontSize: 11, color: "#b91c1c" }}>
          ✕
        </span>
      )}
      {state?.status === "success" && (
        <span role="status" style={{ fontSize: 11, color: "#15803d" }}>
          ✓
        </span>
      )}
    </form>
  );
}
