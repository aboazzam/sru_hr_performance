"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { updateOrgIdentity, type UpdateIdentityState } from "@/app/[locale]/(app)/admin/identity/actions";

type ErrorMessage = Extract<UpdateIdentityState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

const ACCEPTED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export function OrgIdentityForm({
  canEdit,
  identity,
}: {
  canEdit: boolean;
  identity: { logo_url: string | null; primary_color: string | null; secondary_color: string | null } | null;
}) {
  const t = useTranslations("IdentityPage");
  const [state, formAction, pending] = useActionState<UpdateIdentityState, FormData>(updateOrgIdentity, null);
  const [logoUrl, setLogoUrl] = useState(identity?.logo_url ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploadError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError(t("logoErrorType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError(t("logoErrorSize"));
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("org-branding").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);

    if (error) {
      setUploadError(t("logoErrorUpload"));
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("org-branding").getPublicUrl(path);
    setLogoUrl(publicUrlData.publicUrl);
  }

  return (
    <form action={formAction} className="space-y-5" style={{ maxWidth: 480 }}>
      <div>
        <label className="block text-sm font-medium mb-1">{t("logoUrlLabel")}</label>
        <input type="hidden" name="logoUrl" value={logoUrl} />
        <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginBottom: 8 }}>{t("logoUploadInstructions")}</p>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Storage public URL, not a static asset next/image can optimize without a remote-pattern config.
          <img src={logoUrl} alt="" style={{ maxHeight: 64, marginBottom: 8, display: "block" }} />
        )}
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              disabled={uploading}
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="sru-btn"
            >
              {uploading ? t("logoUploading") : t("logoUploadButton")}
            </button>
          </>
        )}
        {uploadError && (
          <p role="alert" className="text-sm text-red-600" style={{ marginTop: 6 }}>
            {uploadError}
          </p>
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
          disabled={pending || uploading}
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
