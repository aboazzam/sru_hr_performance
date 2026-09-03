"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Tag, Sliders, ShieldQuestion } from "lucide-react";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { createThreeSixtyCycle, type CreateThreeSixtyCycleState } from "@/app/[locale]/(app)/three-sixty/actions";

type ErrorMessage = Extract<CreateThreeSixtyCycleState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown_scale: "errorUnknownScale",
  unknown: "errorUnknown",
};

export function ThreeSixtyNewCycleForm({ scaleCodes }: { scaleCodes: string[] }) {
  const t = useTranslations("ThreeSixtyNewCyclePage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CreateThreeSixtyCycleState, FormData>(
    createThreeSixtyCycle,
    null
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  if (state?.status === "success") {
    startTransition(() => router.push(`/three-sixty/${state.cycleId}`));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Tag size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionBasicTitle")}</h3>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("cycleCodeLabel")}</label>
            <input type="text" name="cycleCode" required dir="ltr" style={{ textAlign: "left" }} placeholder={t("cycleCodePlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("nameArLabel")}</label>
            <input type="text" name="nameAr" required dir="rtl" placeholder={t("nameArPlaceholder")} />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("purposeLabel")}</label>
            <textarea name="purpose" rows={2} placeholder={t("purposePlaceholder")} />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Sliders size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionBoundsTitle")}</h3>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("startDateLabel")}</label>
            <DateFieldDmy name="startDate" value={startDate} onChange={setStartDate} ariaLabel={t("startDateLabel")} />
          </div>
          <div className="sru-field">
            <label>{t("endDateLabel")}</label>
            <DateFieldDmy name="endDate" value={endDate} onChange={setEndDate} ariaLabel={t("endDateLabel")} />
          </div>
          <div className="sru-field">
            <label>{t("minRatersLabel")}</label>
            <input type="number" name="minRaters" min={1} required defaultValue={3} />
          </div>
          <div className="sru-field">
            <label>{t("maxRatersLabel")}</label>
            <input type="number" name="maxRaters" min={1} placeholder={t("maxRatersPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("minMonthsTogetherLabel")}</label>
            <input type="number" name="minMonthsTogether" min={0} defaultValue={0} />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <ShieldQuestion size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionSettingsTitle")}</h3>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("scaleCodeLabel")}</label>
            <select name="scaleCode" required defaultValue="">
              <option value="" disabled>
                {t("scaleCodePlaceholder")}
              </option>
              {scaleCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("anonymityModeLabel")}</label>
            <select name="anonymityMode" defaultValue="anonymous">
              <option value="anonymous">{t("anonymityModeAnonymous")}</option>
              <option value="identified">{t("anonymityModeIdentified")}</option>
            </select>
          </div>
          <div className="sru-field">
            <label>{t("weightInTotalScoreLabel")}</label>
            <input type="number" name="weightInTotalScore" min={0} max={100} step="0.1" placeholder={t("weightInTotalScorePlaceholder")} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input type="checkbox" name="includeSelfAssessment" defaultChecked />
            {t("includeSelfAssessmentLabel")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input type="checkbox" name="showManagerSeparately" defaultChecked />
            {t("showManagerSeparatelyLabel")}
          </label>
        </div>
      </section>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending || startDate === "" || endDate === ""} className="sru-btn sru-btn-primary">
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}
