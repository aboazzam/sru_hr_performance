"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Check } from "lucide-react";
import type { ExecutivePlanTargetState } from "@/app/[locale]/(app)/executive-plans/[id]/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  percentage_total: "errorPercentageTotal",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * One "record the actual" input, shared by all three levels of the cascade —
 * the whole target, a unit's share, an employee's share. Only the Server
 * Action differs, so it is passed in rather than duplicating the field three
 * times.
 *
 * Save stays disabled until the value actually differs from what is stored,
 * so an accidental click cannot rewrite a figure with itself; and an empty box
 * is a real value (it clears the figure), not a blocked one — "not recorded"
 * and "zero" are different states everywhere else here too.
 */
export function ActualValueField({
  id,
  initialValue,
  unit,
  label,
  canEdit,
  action,
}: {
  id: string;
  initialValue: number | string | null;
  unit?: string;
  label: string;
  canEdit: boolean;
  action: (prev: ExecutivePlanTargetState, formData: FormData) => Promise<ExecutivePlanTargetState>;
}) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const router = useRouter();
  const stored = initialValue == null ? "" : String(initialValue);
  const [value, setValue] = useState(stored);
  const [state, formAction, pending] = useActionState<ExecutivePlanTargetState, FormData>(action, null);

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  if (!canEdit) {
    return (
      <span style={{ fontSize: 12.5 }}>
        {label}: {stored === "" ? t("actualNotRecorded") : `${stored}${unit ? " " + unit : ""}`}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 6, flexWrap: "wrap" }}>
      <span className="sru-field" style={{ maxWidth: 150 }}>
        <label>{label}</label>
        <input
          type="number"
          step="0.01"
          value={value}
          placeholder={t("actualPlaceholder")}
          onChange={(e) => setValue(e.target.value)}
        />
        {/* The button is disabled until the number changes, which on an empty
            box looks like a dead control rather than a waiting one. */}
        <span style={{ color: "var(--sru-muted)", fontSize: 11 }}>{t("actualHint")}</span>
      </span>
      <button
        type="button"
        className="sru-btn sru-btn-primary"
        title={value === stored ? t("actualHint") : undefined}
        disabled={pending || value === stored}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", id);
          formData.set("actual", value);
          startTransition(() => formAction(formData));
        }}
      >
        <Check size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
        {pending ? t("savingButton") : t("actualSave")}
      </button>
      {state?.status === "error" && (
        <span role="alert" style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 12 }}>
          <AlertCircle size={13} aria-hidden style={{ marginInlineEnd: 4, verticalAlign: "middle" }} />
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </span>
      )}
    </span>
  );
}
