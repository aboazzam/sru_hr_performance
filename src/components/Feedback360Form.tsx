"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { submitFeedback360, type SubmitFeedback360State } from "@/app/[locale]/(app)/feedback-360/actions";
import { evalTypes, evalTypeLabels } from "@/lib/vpra";

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
}

interface CycleOption {
  id: string;
  name_ar: string;
  start_date: string;
  end_date: string;
}

type ErrorMessage = Extract<SubmitFeedback360State, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export function Feedback360Form({
  employees,
  cycles,
  myProfileId,
}: {
  employees: EmployeeOption[];
  cycles: CycleOption[];
  myProfileId: string;
}) {
  const t = useTranslations("Feedback360Page");
  const [state, formAction, pending] = useActionState<SubmitFeedback360State, FormData>(
    submitFeedback360,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const targetSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  const inputClass =
    "w-full px-4 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-medium mb-1">{t("relationLabel")}</label>
        <select
          name="evaluatorRelation"
          required
          className={inputClass}
          defaultValue=""
          onChange={(e) => {
            const select = targetSelectRef.current;
            if (!select) return;
            // Deliberately does NOT set `select.disabled = true` here — a
            // disabled <select> is excluded from FormData entirely on
            // submit, which silently dropped `targetEmployeeId` and made
            // every "self" submission fail server-side validation (caught
            // live while verifying this screen). Auto-selecting the value
            // is enough of a UX nudge; the server independently enforces
            // that a 'self' relation must target the caller's own profile.
            if (e.target.value === "self") {
              select.value = myProfileId;
            } else if (select.value === myProfileId) {
              select.value = "";
            }
          }}
        >
          <option value="" disabled>
            {t("relationPlaceholder")}
          </option>
          {evalTypes.map((type) => (
            <option key={type} value={type}>
              {evalTypeLabels[type]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("targetLabel")}</label>
        <select
          name="targetEmployeeId"
          ref={targetSelectRef}
          required
          className={inputClass}
          defaultValue=""
        >
          <option value="" disabled>
            {t("targetPlaceholder")}
          </option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.employee_number} — {employee.full_name_ar}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("cycleLabel")}</label>
        <select name="cycleId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("cyclePlaceholder")}
          </option>
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.name_ar} ({cycle.start_date} – {cycle.end_date})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("overallScoreLabel")}</label>
        <input
          type="number" lang="en"
          name="overallScore"
          min={0}
          max={100}
          step="0.1"
          className={inputClass}
          placeholder={t("overallScorePlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("commentsLabel")}</label>
        <textarea
          name="comments"
          dir="rtl"
          rows={4}
          className={inputClass}
          placeholder={t("commentsPlaceholder")}
        />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" name="isAnonymous" id="isAnonymous" defaultChecked />
        <label htmlFor="isAnonymous" className="text-sm">
          {t("isAnonymousLabel")}
        </label>
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      {state?.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {t("successMessage")}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2 bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
