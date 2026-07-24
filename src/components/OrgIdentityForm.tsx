"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateOrgIdentity, type UpdateIdentityState } from "@/app/[locale]/(app)/admin/identity/actions";

type ErrorMessage = Extract<UpdateIdentityState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function OrgIdentityForm({
  canEdit,
  identity,
}: {
  canEdit: boolean;
  identity: { logo_url: string | null; primary_color: string | null; secondary_color: string | null } | null;
}) {
  const t = useTranslations("IdentityPage");
  const [state, formAction, pending] = useActionState<UpdateIdentityState, FormData>(updateOrgIdentity, null);

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form action={formAction} className="space-y-5" style={{ maxWidth: 480 }}>
      <div>
        <label className="block text-sm font-medium mb-1">{t("logoUrlLabel")}</label>
        <input
          type="url"
          name="logoUrl"
          dir="ltr"
          disabled={!canEdit}
          defaultValue={identity?.logo_url ?? ""}
          className={inputClass}
          placeholder={t("logoUrlPlaceholder")}
        />
        <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginTop: 4 }}>{t("logoUrlNote")}</p>
        {identity?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- external, arbitrary URL; next/image requires a configured remote pattern this settings screen shouldn't need to manage.
          <img src={identity.logo_url} alt="" style={{ maxHeight: 48, marginTop: 8 }} />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("primaryColorLabel")}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="text"
            name="primaryColor"
            dir="ltr"
            disabled={!canEdit}
            defaultValue={identity?.primary_color ?? ""}
            className={inputClass}
            placeholder="#501e8c"
          />
          {identity?.primary_color && (
            <span
              aria-hidden
              style={{ width: 28, height: 28, borderRadius: 6, background: identity.primary_color, border: "1px solid var(--sru-border)", flexShrink: 0 }}
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("secondaryColorLabel")}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="text"
            name="secondaryColor"
            dir="ltr"
            disabled={!canEdit}
            defaultValue={identity?.secondary_color ?? ""}
            className={inputClass}
            placeholder="#0a6eaa"
          />
          {identity?.secondary_color && (
            <span
              aria-hidden
              style={{ width: 28, height: 28, borderRadius: 6, background: identity.secondary_color, border: "1px solid var(--sru-border)", flexShrink: 0 }}
            />
          )}
        </div>
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}
      {state?.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {t("successMessage")}
        </p>
      )}

      {canEdit ? (
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2 rounded-lg bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      ) : (
        <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>{t("viewOnlyNote")}</p>
      )}
    </form>
  );
}
