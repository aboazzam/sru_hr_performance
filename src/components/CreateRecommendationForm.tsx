"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createRecommendation, type CreateRecommendationState } from "@/app/[locale]/(app)/recommendations/actions";

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
}
interface CycleOption {
  id: string;
  name_ar: string;
}

type ErrorMessage = Extract<CreateRecommendationState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function CreateRecommendationForm({ employees, cycles }: { employees: EmployeeOption[]; cycles: CycleOption[] }) {
  const t = useTranslations("RecommendationsPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CreateRecommendationState, FormData>(createRecommendation, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

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
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" style={{ maxWidth: 480 }}>
      <div>
        <label className="block text-sm font-medium mb-1">{t("employeeLabel")}</label>
        <select name="employeeId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("employeePlaceholder")}
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employee_number} — {e.full_name_ar}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("typeLabel")}</label>
        <select name="type" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("typePlaceholder")}
          </option>
          <option value="development">{t("typeDevelopment")}</option>
          <option value="separation">{t("typeSeparation")}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("cycleLabel")}</label>
        <select name="cycleId" className={inputClass} defaultValue="">
          <option value="">{t("cyclePlaceholder")}</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_ar}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("reasoningLabel")}</label>
        <textarea name="reasoning" rows={3} dir="rtl" className={inputClass} placeholder={t("reasoningPlaceholder")} />
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
        className="w-full py-2 rounded-lg bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
