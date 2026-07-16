"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type LoginState } from "@/app/[locale]/login/actions";
import type { Locale } from "@/i18n/config";

type LoginError = NonNullable<LoginState>["error"];

const errorMessageKeys: Record<LoginError, string> = {
  invalid_input: "invalidInput",
  invalid_credentials: "invalidCredentials",
  rate_limited: "rateLimited",
};

export function LoginForm({ locale }: { locale: Locale }) {
  const t = useTranslations("LoginPage");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login.bind(null, locale),
    null
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">
          {t("emailLabel")}
        </label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder={t("emailPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          {t("passwordLabel")}
        </label>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder={t("passwordPlaceholder")}
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.error])}
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
