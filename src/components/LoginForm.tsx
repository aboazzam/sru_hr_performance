"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { login, type LoginState } from "@/app/[locale]/login/actions";
import { Link } from "@/i18n/navigation";
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
  const [showPassword, setShowPassword] = useState(false);

  // React 19's <form action={fn}> resets every uncontrolled field after ANY
  // submission, success or error alike -- a wrong password would otherwise
  // wipe the identifier the user just typed too. See EmployeeInviteForm.tsx
  // for the full writeup of this quirk.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="sru-field-float">
        <input
          id="login-identifier"
          type="text"
          name="identifier"
          required
          autoComplete="username"
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="login-identifier">
          <Mail size={14} aria-hidden style={{ display: "inline", marginInlineEnd: 6, verticalAlign: "-2px" }} />
          {t("identifierLabel")}
        </label>
      </div>

      <div className="sru-field-float has-toggle">
        <input
          id="login-password"
          type={showPassword ? "text" : "password"}
          name="password"
          required
          autoComplete="current-password"
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="login-password">
          <Lock size={14} aria-hidden style={{ display: "inline", marginInlineEnd: 6, verticalAlign: "-2px" }} />
          {t("passwordLabel")}
        </label>
        <button
          type="button"
          className="sru-pass-toggle"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? t("hidePassword") : t("showPassword")}
        >
          {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>

      {state?.error && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.error])}
        </p>
      )}

      <button type="submit" disabled={pending} className="sru-auth-submit">
        {pending ? t("submitting") : t("submit")}
      </button>

      <p className="sru-auth-link-row">
        <Link href="/forgot-password">{t("forgotPassword")}</Link>
      </p>
    </form>
  );
}
