"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/[locale]/forgot-password/actions";
import type { Locale } from "@/i18n/config";

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations("ForgotPasswordPage");
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset.bind(null, locale),
    null
  );

  if (state?.status === "sent") {
    return (
      <p role="status" className="text-sm text-green-700 text-center">
        {t("successMessage")}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">{t("emailLabel")}</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder={t("emailPlaceholder")}
        />
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(state.error === "rate_limited" ? "rateLimited" : "invalidInput")}
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
