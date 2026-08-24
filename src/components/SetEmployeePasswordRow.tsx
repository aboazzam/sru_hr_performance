"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import {
  setEmployeePassword,
  type SetPasswordState,
} from "@/app/[locale]/(app)/employees/[id]/edit/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "passwordErrorTooShort",
  unauthenticated: "passwordErrorUnauthenticated",
  forbidden: "passwordErrorForbidden",
  no_account: "passwordErrorNoAccount",
  unknown: "passwordErrorUnknown",
};

/**
 * The administrator's "set a password for this employee" control.
 *
 * NOT a nested `<form>`: this sits inside the employee edit form, and a form
 * inside a form is invalid HTML — the same reason `UserRoleAssignRow` beside
 * it saves through its own button. It also means a password is never carried
 * along by an unrelated "save profile" submit; it is sent only when this
 * button is pressed, and nothing else on the screen can send it by accident.
 *
 * The typed value is cleared the moment it succeeds, so a working password to
 * somebody else's account is not left sitting on an unattended screen.
 *
 * A generator is offered because the alternative is an admin inventing
 * "12345678" under time pressure; it uses `crypto.getRandomValues`, the same
 * source the direct-create flow already uses, and the value never leaves the
 * browser until the deliberate submit.
 */
export function SetEmployeePasswordRow({ profileId }: { profileId: string }) {
  const t = useTranslations("EmployeeEditPage");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SetPasswordState>(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);

  function suggest() {
    const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setPassword([...bytes].map((n) => alphabet[n % alphabet.length]).join(""));
    // Shown on purpose: the admin has to be able to read it to hand it over.
    setReveal(true);
    setState(null);
  }

  function save() {
    setState(null);
    startTransition(async () => {
      const result = await setEmployeePassword({ profileId, password });
      setState(result);
      if (result?.status === "success") {
        setPassword("");
        setReveal(false);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <input
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder={t("passwordPlaceholder")}
            aria-label={t("passwordLabel")}
            dir="ltr"
            style={{ textAlign: "left", width: "100%" }}
          />
          <button
            type="button"
            className="sru-pass-toggle"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? t("hidePassword") : t("showPassword")}
          >
            {reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </div>
        <button type="button" className="sru-btn" onClick={suggest} disabled={pending}>
          {t("suggestPassword")}
        </button>
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          onClick={save}
          disabled={pending || password.trim().length < 8}
        >
          <KeyRound size={15} aria-hidden style={{ verticalAlign: "-2px", marginLeft: 4 }} />
          {pending ? t("submitting") : t("setPasswordButton")}
        </button>
      </div>

      <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("passwordHint")}</span>

      {state?.status === "error" && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
          {t(errorKeys[state.message] ?? "passwordErrorUnknown")}
        </span>
      )}
      {state?.status === "success" && (
        <span role="status" style={{ color: "#15803d", fontSize: 11.5 }}>
          {t("passwordSet")}
        </span>
      )}
    </div>
  );
}
