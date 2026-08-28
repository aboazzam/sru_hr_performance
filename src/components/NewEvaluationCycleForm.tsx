"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Tag, Scale } from "lucide-react";
import {
  createEvaluationCycle,
  type CreateEvaluationCycleState,
  type EvaluationCycleType,
} from "@/app/[locale]/(app)/evaluations/cycles/new/actions";
import {
  CYCLE_DURATION_PRESETS,
  computeEndDate,
  describeCycleDuration,
  type CycleDurationPreset,
} from "@/lib/cyclePeriod";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { WeightGroupFields } from "@/components/WeightGroupFields";
import { isValidWeights, type EvaluationMethod, type MethodWeights } from "@/lib/evaluationCycle";
import type { Locale } from "@/i18n/config";

type ErrorMessage = Extract<CreateEvaluationCycleState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

const cycleTypeOptions: EvaluationCycleType[] = ["academic", "calendar", "fiscal"];

const cycleTypeLabelKeys: Record<EvaluationCycleType, string> = {
  academic: "cycleTypeAcademic",
  calendar: "cycleTypeCalendar",
  fiscal: "cycleTypeFiscal",
};

export function NewEvaluationCycleForm({ locale }: { locale: Locale }) {
  const t = useTranslations("NewEvaluationCyclePage");
  const [state, formAction, pending] = useActionState<CreateEvaluationCycleState, FormData>(
    createEvaluationCycle.bind(null, locale),
    null
  );

  // The period fields are always enabled (2026-08-05, requested directly).
  // They first rendered only after a period type was chosen, then briefly
  // rendered disabled with an explanatory note; both gates are gone. The type
  // select stays `required`, so the browser still blocks submission until it
  // is filled in, whichever field the admin starts from.
  const [cycleType, setCycleType] = useState<EvaluationCycleType | "">("");

  // There is no `duration` column on evaluation_cycles — the duration is the
  // span between the two dates. The preset just computes the end date from the
  // start; picking dates by hand switches it to "custom" rather than fighting
  // the user's own choice.
  const [duration, setDuration] = useState<CycleDurationPreset | "custom">(12);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // The distribution belongs here, not only on the cycle screen afterwards:
  // it governs every evaluation in the cycle, so creation is the moment it
  // is actually a decision. 25 each is the DB default, so the form opens on
  // a valid total rather than an error.
  const [weights, setWeights] = useState<MethodWeights>({
    activities: 25,
    competencies: 25,
    bau: 25,
    feedback360: 25,
  });
  const weightsValid = isValidWeights(weights);
  const weightFieldNames: Record<EvaluationMethod, string> = {
    activities: "weightActivities",
    competencies: "weightCompetencies",
    bau: "weightBau",
    feedback360: "weightFeedback360",
  };

  function applyStartDate(value: string) {
    setStartDate(value);
    if (duration !== "custom") {
      setEndDate(computeEndDate(value, duration) ?? "");
    }
  }

  function applyDuration(value: CycleDurationPreset | "custom") {
    setDuration(value);
    if (value !== "custom" && startDate) {
      setEndDate(computeEndDate(startDate, value) ?? "");
    }
  }

  function applyEndDate(value: string) {
    setEndDate(value);
    // An end date that no longer matches the selected preset means the period
    // is hand-picked — say so rather than silently leaving a stale preset.
    if (duration !== "custom" && startDate && computeEndDate(startDate, duration) !== value) {
      setDuration("custom");
    }
  }

  const span = describeCycleDuration(startDate, endDate);
  const invalidRange = startDate !== "" && endDate !== "" && span === null;

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
    <form onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Tag size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionBasicTitle")}</h3>
            <span>{t("sectionBasicSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("cycleTypeLabel")}</label>
            <select
              name="cycleType"
              required
              value={cycleType}
              onChange={(event) => setCycleType(event.target.value as EvaluationCycleType)}
            >
              <option value="" disabled>
                {t("cycleTypePlaceholder")}
              </option>
              {cycleTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {t(cycleTypeLabelKeys[type])}
                </option>
              ))}
            </select>
          </div>

          <div className="sru-field">
            <label>{t("nameArLabel")}</label>
            <input type="text" name="nameAr" required dir="rtl" placeholder={t("nameArPlaceholder")} />
          </div>

          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("nameEnLabel")}</label>
            <input
              type="text"
              name="nameEn"
              dir="ltr"
              style={{ textAlign: "left" }}
              placeholder={t("nameEnPlaceholder")}
            />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <CalendarRange size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionPeriodTitle")}</h3>
            <span>{t("sectionPeriodSubtitle")}</span>
          </div>
        </div>

        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("durationLabel")}</label>
            <select
              value={duration}
              onChange={(event) =>
                applyDuration(
                  event.target.value === "custom"
                    ? "custom"
                    : (Number(event.target.value) as CycleDurationPreset)
                )
              }
            >
              {CYCLE_DURATION_PRESETS.map((months) => (
                <option key={months} value={months}>
                  {t("durationMonths", { months })}
                </option>
              ))}
              <option value="custom">{t("durationCustom")}</option>
            </select>
          </div>

          <div className="sru-field">
            <label>{t("startDateLabel")}</label>
            <DateFieldDmy
              name="startDate"
              value={startDate}
              onChange={applyStartDate}
              ariaLabel={t("startDateLabel")}
            />
          </div>

          <div className="sru-field">
            <label>{t("endDateLabel")}</label>
            <DateFieldDmy
              name="endDate"
              value={endDate}
              onChange={applyEndDate}
              ariaLabel={t("endDateLabel")}
            />
          </div>

          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            {invalidRange ? (
              <p role="alert" style={{ fontSize: 11.5, color: "#b91c1c" }}>
                {t("periodInvalidRange")}
              </p>
            ) : span ? (
              <p style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>
                {span.months
                  ? t("periodSummaryMonths", { months: span.months, days: span.days })
                  : t("periodSummaryDays", { days: span.days })}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Scale size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionWeightsTitle")}</h3>
            <span>{t("sectionWeightsSubtitle")}</span>
          </div>
        </div>

        <WeightGroupFields
          idPrefix="new-cycle"
          values={weights}
          onChange={setWeights}
          fieldNames={weightFieldNames}
        />
      </section>
      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      <div className="sru-form-submitrow">
        {/* The dates now submit through hidden inputs, which browsers do not
            validate — so the guarantee the old  attributes gave is
            kept here instead of being quietly lost. */}
        <button
          type="submit"
          disabled={pending || startDate === "" || endDate === "" || !weightsValid}
          className="sru-btn sru-btn-primary"
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}
