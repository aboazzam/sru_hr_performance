"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
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
      <p role="status" className="sru-auth-alert success">
        <CheckCircle2 size={15} aria-hidden />
        {t("successMessage")}
      </p>
    );
  }

  return (
    <form action={formAction}>
      <div className="sru-field-float">
        <input
          id="forgot-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="forgot-email">
          <Mail size={14} aria-hidden style={{ display: "inline", marginInlineEnd: 6, verticalAlign: "-2px" }} />
          {t("emailLabel")}
        </label>
      </div>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(state.error === "rate_limited" ? "rateLimited" : "invalidInput")}
        </p>
      )}

      <button type="submit" disabled={pending} className="sru-auth-submit">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
