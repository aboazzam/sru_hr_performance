"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "submitting" | "success";

/**
 * Unlike ResetPasswordForm, there is no recovery/invite hash token to parse
 * here — the caller already has a real session (they just signed in with an
 * admin-set/system-suggested temporary password), so this goes straight to
 * `supabase.auth.updateUser({password})`. `clear_must_change_password()`
 * (20260725000007) then clears the flag that got them redirected here in the
 * first place — a narrow SECURITY DEFINER self-write, since a user forced to
 * change their own password very likely holds no employeeData grant to
 * update their own profiles row through the normal RLS path.
 */
export function ChangePasswordForm() {
  const t = useTranslations("ChangePasswordPage");
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      setStatus("idle");
      return;
    }

    // Best-effort: the password itself is already changed at this point —
    // failing to clear the flag would only mean seeing this page once more
    // on the next login, not a lost password change.
    await supabase.rpc("clear_must_change_password");

    setStatus("success");
    setTimeout(() => router.push("/"), 1500);
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
    <form onSubmit={handleSubmit}>
      <div className="sru-field-float has-toggle">
        <input
          id="change-password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="change-password">
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
          id="change-confirm-password"
          type={showConfirmPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder=" "
          dir="ltr"
          style={{ textAlign: "left" }}
        />
        <label htmlFor="change-confirm-password">
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
