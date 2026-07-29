"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Compass, Flag } from "lucide-react";
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

  const [visionAr, setVisionAr] = useState(identity?.vision_ar ?? "");
  const [visionEn, setVisionEn] = useState(identity?.vision_en ?? "");
  const [missionAr, setMissionAr] = useState(identity?.mission_ar ?? "");
  const [missionEn, setMissionEn] = useState(identity?.mission_en ?? "");

  // The last-SAVED baseline (starts at the initially loaded values) -- Save
  // stays disabled until the current form state actually diverges from this,
  // same pattern as EditRoleForm (project owner's explicit "Save should stay
  // inactive until a real change happens" request, reused here since the
  // Save button was reported as always-active regardless of edits).
  const [savedVisionAr, setSavedVisionAr] = useState(identity?.vision_ar ?? "");
  const [savedVisionEn, setSavedVisionEn] = useState(identity?.vision_en ?? "");
  const [savedMissionAr, setSavedMissionAr] = useState(identity?.mission_ar ?? "");
  const [savedMissionEn, setSavedMissionEn] = useState(identity?.mission_en ?? "");

  const isDirty =
    visionAr !== savedVisionAr || visionEn !== savedVisionEn || missionAr !== savedMissionAr || missionEn !== savedMissionEn;

  // "Adjust state during rendering" (not inside an effect) so this doesn't
  // trip react-hooks/set-state-in-effect -- same established pattern as
  // EmployeeInviteForm's success handling.
  const [lastHandledState, setLastHandledState] = useState<UpdateStrategicIdentityState>(null);
  if (state?.status === "success" && state !== lastHandledState) {
    setLastHandledState(state);
    setSavedVisionAr(visionAr);
    setSavedVisionEn(visionEn);
    setSavedMissionAr(missionAr);
    setSavedMissionEn(missionEn);
  }

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike -- these
  // fields are controlled (for the dirty-check above) so that reset doesn't
  // apply here, but this still keeps `pending` wired to the transition.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Compass size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionVisionTitle")}</h3>
            <span>{t("sectionVisionSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("visionArLabel")}</label>
            <textarea
              name="visionAr"
              dir="rtl"
              rows={2}
              disabled={!canEdit}
              value={visionAr}
              onChange={(e) => setVisionAr(e.target.value)}
              placeholder={t("visionArPlaceholder")}
            />
          </div>
          <div className="sru-field">
            <label>{t("visionEnLabel")}</label>
            <textarea
              name="visionEn"
              dir="ltr"
              rows={2}
              disabled={!canEdit}
              value={visionEn}
              onChange={(e) => setVisionEn(e.target.value)}
              placeholder={t("visionEnPlaceholder")}
            />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Flag size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionMissionTitle")}</h3>
            <span>{t("sectionMissionSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("missionArLabel")}</label>
            <textarea
              name="missionAr"
              dir="rtl"
              rows={2}
              disabled={!canEdit}
              value={missionAr}
              onChange={(e) => setMissionAr(e.target.value)}
              placeholder={t("missionArPlaceholder")}
            />
          </div>
          <div className="sru-field">
            <label>{t("missionEnLabel")}</label>
            <textarea
              name="missionEn"
              dir="ltr"
              rows={2}
              disabled={!canEdit}
              value={missionEn}
              onChange={(e) => setMissionEn(e.target.value)}
              placeholder={t("missionEnPlaceholder")}
            />
          </div>
        </div>
      </section>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.message])}
        </p>
      )}
      {state?.status === "success" && (
        <p role="status" className="sru-auth-alert success">
          <CheckCircle2 size={15} aria-hidden />
          {t("successMessage")}
        </p>
      )}

      {canEdit ? (
        <div className="sru-form-submitrow">
          <button type="submit" disabled={pending || !isDirty} className="sru-btn sru-btn-primary">
            {pending ? t("submitting") : t("submit")}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>{t("viewOnlyNote")}</p>
      )}
    </form>
  );
}
