"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Pencil } from "lucide-react";
import { updateMyCertificates, type ProfileActionState } from "@/app/[locale]/(app)/profile/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "certificatesErrorInvalid",
  unauthenticated: "certificatesErrorUnauthenticated",
  unknown: "certificatesErrorUnknown",
};

/**
 * The certificates a person holds, with a pencil beside them so they can keep
 * the list right themselves — the rest of this screen stays read-only.
 *
 * The write is `update_my_certificates()` (20260821000002): it finds the row
 * by `auth.uid()` and touches that column alone, so nothing here carries a
 * profile id and no `employeeData` grant is needed.
 */
export function MyCertificatesEditor({ certificates }: { certificates: string }) {
  const t = useTranslations("MyProfilePage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(updateMyCertificates, null);

  // Closing touches a ref, which belongs in an effect, not in render — and
  // it happens only on success: an error keeps the dialog open with its
  // message inside, so nothing typed is lost.
  useEffect(() => {
    if (state?.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const lines = certificates
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {lines.length === 0 ? (
            "—"
          ) : (
            <ul style={{ margin: 0, paddingInlineStart: 16 }}>
              {lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="sru-icon-action"
          title={t("certificatesEdit")}
          aria-label={t("certificatesEdit")}
          onClick={() => dialogRef.current?.showModal()}
        >
          <Pencil size={14} aria-hidden />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t("certificatesEdit")}</h3>
            <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("certificatesHint")}</span>
          </div>
          <button
            type="button"
            className="sru-modal-close"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("closeButton")}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <div className="sru-field">
            <label>{t("certificatesLabel")}</label>
            <textarea name="certificates" rows={6} dir="rtl" defaultValue={certificates} maxLength={4000} />
          </div>

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
              <AlertCircle size={15} aria-hidden />
              {t(errorKeys[state.message] ?? "certificatesErrorUnknown")}
            </p>
          )}

          <div className="sru-form-submitrow">
            <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
              {pending ? t("certificatesSaving") : t("certificatesSave")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
