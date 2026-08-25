"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
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
 *
 * The `type !== "recovery"` guard originally rejected `type=invite` outright
 * despite this comment already claiming to handle it -- found live testing a
 * real invite link end-to-end (2026-07-22): a freshly-generated, unexpired
 * link verified correctly at Supabase and produced a valid access_token/
 * refresh_token hash, but nothing in the app recognized `type=invite`, so
 * the invited user was silently stranded with no way to set an initial
 * password. `setSession()` doesn't care which flow produced the tokens, so
 * accepting both types here (and in `RecoveryHashRedirect`) was the entire
 * fix.
 */
export function ResetPasswordForm() {
  const t = useTranslations("ResetPasswordPage");
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if ((type !== "recovery" && type !== "invite") || !accessToken || !refreshToken) {
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

  if (status === "checking") {
    return <p className="sru-auth-status">{t("checking")}</p>;
  }

  if (status === "invalid") {
    return (
      <p role="alert" className="sru-auth-alert error">
        <AlertCircle size={15} aria-hidden />
        {t("errorInvalidLink")}
      </p>
    );
  }

  if (status === "success") {
    return (
      <p role="status" className="sru-auth-alert success">
        <CheckCircle2 size={15} aria-hidden />
        {t("successMessage")}
      </p>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit}>
      <div className="sru-field-float has-toggle">
        <input
          id="reset-password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="reset-password">
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

      <div className="sru-field-float has-toggle">
        <input
          id="reset-confirm-password"
          type={showConfirmPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="reset-confirm-password">
          <Lock size={14} aria-hidden style={{ display: "inline", marginInlineEnd: 6, verticalAlign: "-2px" }} />
          {t("confirmPasswordLabel")}
        </label>
        <button
          type="button"
          className="sru-pass-toggle"
          onClick={() => setShowConfirmPassword((v) => !v)}
          aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}
        >
          {showConfirmPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>

      {error && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {error}
        </p>
      )}

      <button type="submit" disabled={status === "submitting"} className="sru-auth-submit">
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
