"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updateSystemSettings, type UpdateSystemSettingsState } from "@/app/[locale]/(app)/admin/settings/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * "إعدادات النظام" form (2026-07-26), starting with a single field: the
 * IANA timezone used to render timestamps app-wide (e.g. the User Activity
 * tab's last-sign-in column, which was reported showing UK time instead of
 * Saudi time). `timezoneOptions` comes from the server
 * (`Intl.supportedValuesOf("timeZone")`) rather than a hand-curated list, so
 * every real IANA zone is selectable, not an incomplete guess.
 *
 * Dirty-state tracking mirrors `EditRoleForm`'s established pattern: Save
 * stays disabled until the selected value actually differs from the saved
 * baseline, re-disabling immediately after a successful save.
 */
export function SystemSettingsForm({
  canEdit,
  currentTimezone,
  timezoneOptions,
}: {
  canEdit: boolean;
  currentTimezone: string;
  timezoneOptions: string[];
}) {
  const t = useTranslations("SystemSettingsPage");
  const [state, formAction, isPending] = useActionState<UpdateSystemSettingsState, FormData>(updateSystemSettings, null);
  const [savedTimezone, setSavedTimezone] = useState(currentTimezone);
  const [timezone, setTimezone] = useState(currentTimezone);

  const isDirty = timezone !== savedTimezone;

  if (state?.status === "success" && savedTimezone !== timezone) {
    setSavedTimezone(timezone);
  }

  return (
    <form
      action={formAction}
      className="sru-card"
      style={{ padding: 20, maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {!canEdit && <p style={{ color: "var(--sru-muted)", fontSize: 12.5, margin: 0 }}>{t("viewOnlyNote")}</p>}

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{t("timezoneLabel")}</span>
        <select
          name="timezone"
          value={timezone}
          disabled={!canEdit}
          onChange={(e) => setTimezone(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "var(--sru-radius)", border: "1px solid var(--sru-border)", fontSize: 13 }}
          dir="ltr"
        >
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>

      {canEdit && (
        <button type="submit" disabled={isPending || !isDirty} className="sru-btn sru-btn-primary" style={{ alignSelf: "flex-start" }}>
          {isPending ? t("submitting") : t("submit")}
        </button>
      )}

      {state?.status === "success" && <p style={{ color: "var(--sru-success, #15803d)", fontSize: 12.5, margin: 0 }}>{t("successMessage")}</p>}
      {state?.status === "error" && (
        <p role="alert" style={{ color: "#b91c1c", fontSize: 12.5, margin: 0 }}>
          {t(errorMessageKeys[state.message] ?? "errorUnknown")}
        </p>
      )}
    </form>
  );
}
