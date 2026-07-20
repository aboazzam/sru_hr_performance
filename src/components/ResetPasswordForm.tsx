"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid" | "submitting" | "success";

/**
 * Consumes the recovery/invite access_token that Supabase Auth puts in the
 * URL hash fragment (never sent to the server, so this must run client-side).
 * This page previously didn't exist at all, so that token had nowhere to be
 * consumed (CLAUDE.md/HANDOVER.md's long-standing "no password-reset UI" gap).
 *
 * Deliberately does NOT rely on `@supabase/ssr`'s automatic
 * `detectSessionInUrl` hash-parsing (the original approach here, and the
 * SDK's own documented recommendation) -- found via `auth: { debug: true }`
 * that it always throws `AuthPKCEGrantCodeExchangeError: Not a valid PKCE
 * flow url.` before ever calling `/auth/v1/user`, for every recovery link
 * without exception. Root cause, confirmed by reading
 * node_modules/@supabase/ssr/dist/main/createBrowserClient.js directly:
 * `createBrowserClient` spreads `options.auth` and THEN hardcodes
 * `flowType: "pkce"` unconditionally afterward in the same object literal --
 * silently discarding any `flowType: "implicit"` override, so there is no
 * way to fix this by passing client options; a recovery link's
 * `access_token`/`refresh_token`-in-hash shape is the implicit-grant format,
 * permanently mismatched against the client's hardcoded PKCE flow.
 *
 * The fix: parse the hash ourselves and call `setSession()` directly --
 * `setSession()` has no flow-type dependency at all (verified by reading
 * `GoTrueClient.js`'s `_setSession`), it just needs the two tokens. This
 * sidesteps the SDK's broken auto-detection entirely rather than fighting it.
 */
export function ResetPasswordForm() {
  const t = useTranslations("ResetPasswordPage");
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (type !== "recovery" || !accessToken || !refreshToken) {
      Promise.resolve().then(() => setStatus("invalid"));
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      setStatus(error ? "invalid" : "ready");
    });
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
