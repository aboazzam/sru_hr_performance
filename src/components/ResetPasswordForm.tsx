"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid" | "submitting" | "success";

/**
 * Consumes the recovery/invite access_token that Supabase Auth puts in the
 * URL hash fragment (never sent to the server, so this must run client-side).
 * @supabase/ssr's browser client has `detectSessionInUrl: true` by default —
 * it parses the hash on load and fires `onAuthStateChange` once a session
 * is established. This page previously didn't exist at all, so that token
 * had nowhere to be consumed (CLAUDE.md/HANDOVER.md's long-standing "no
 * password-reset UI" gap).
 */
export function ResetPasswordForm() {
  const t = useTranslations("ResetPasswordPage");
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setStatus((current) => (current === "checking" ? "ready" : current));
      }
    });

    // If the hash was already processed before this listener attached.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus((current) => (current === "checking" ? "ready" : current));
    });

    const timeout = setTimeout(() => {
      setStatus((current) => (current === "checking" ? "invalid" : current));
    }, 5000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("errorTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("errorMismatch"));
      return;
    }

    setStatus("submitting");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(t("errorUnknown"));
      setStatus("ready");
      return;
    }

    setStatus("success");
    setTimeout(() => router.push("/"), 2000);
  }

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  if (status === "checking") {
    return (
      <p className="text-sm text-center" style={{ color: "var(--sru-muted)" }}>
        {t("checking")}
      </p>
    );
  }

  if (status === "invalid") {
    return (
      <p role="alert" className="text-sm text-red-600 text-center">
        {t("errorInvalidLink")}
      </p>
    );
  }

  if (status === "success") {
    return (
      <p role="status" className="text-sm text-green-700 text-center">
        {t("successMessage")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">{t("passwordLabel")}</label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
          placeholder={t("passwordPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("confirmPasswordLabel")}</label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={inputClass}
          placeholder={t("confirmPasswordPlaceholder")}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full py-2 rounded-lg bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
