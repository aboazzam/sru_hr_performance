"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { updateStrategicIdentity, type UpdateStrategicIdentityState } from "@/app/[locale]/(app)/kpis/strategic-identity/actions";

type ErrorMessage = Extract<UpdateStrategicIdentityState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function StrategicIdentityForm({
  canEdit,
  identity,
}: {
  canEdit: boolean;
  identity: { vision_ar: string | null; vision_en: string | null; mission_ar: string | null; mission_en: string | null } | null;
}) {
  const t = useTranslations("StrategicIdentityPage");
  const [state, formAction, pending] = useActionState<UpdateStrategicIdentityState, FormData>(updateStrategicIdentity, null);

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" style={{ maxWidth: 640 }}>
      <div>
        <label className="block text-sm font-medium mb-1">{t("visionArLabel")}</label>
        <textarea
          name="visionAr"
          dir="rtl"
          rows={2}
          disabled={!canEdit}
          defaultValue={identity?.vision_ar ?? ""}
          className={inputClass}
          placeholder={t("visionArPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("visionEnLabel")}</label>
        <textarea
          name="visionEn"
          dir="ltr"
          rows={2}
          disabled={!canEdit}
          defaultValue={identity?.vision_en ?? ""}
          className={inputClass}
          placeholder={t("visionEnPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("missionArLabel")}</label>
        <textarea
          name="missionAr"
          dir="rtl"
          rows={2}
          disabled={!canEdit}
          defaultValue={identity?.mission_ar ?? ""}
          className={inputClass}
          placeholder={t("missionArPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("missionEnLabel")}</label>
        <textarea
          name="missionEn"
          dir="ltr"
          rows={2}
          disabled={!canEdit}
          defaultValue={identity?.mission_en ?? ""}
          className={inputClass}
          placeholder={t("missionEnPlaceholder")}
        />
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
          style={{ maxWidth: 240 }}
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      ) : (
        <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>{t("viewOnlyNote")}</p>
      )}
    </form>
  );
}
