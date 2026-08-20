"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import { updateInitiativeCard, type InitiativeCardState } from "@/app/[locale]/(app)/initiatives/[id]/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { missingInitiativeFields, type InitiativeFieldKey } from "@/lib/initiativeCompleteness";

export interface InitiativeCardFormValues {
  code: string;
  horizon: string;
  titleAr: string;
  titleEn: string;
  deliverableAr: string;
  descriptionAr: string;
  subGoalId: string;
  ownerOrgUnitId: string;
  budgetNote: string;
  statusCode: string;
  startDate: string;
  endDate: string;
}

const errorKeys: Record<string, string> = {
  invalid_input: "cardErrorInvalidInput",
  unauthenticated: "cardErrorUnauthenticated",
  forbidden: "cardErrorForbidden",
  duplicate_code: "cardErrorDuplicateCode",
  unknown: "cardErrorUnknown",
};

/** Label key per field, so the banner and the inline marks stay in step. */
const labelKeys: Record<InitiativeFieldKey, string> = {
  code: "codeLabel",
  horizon: "horizonLabel",
  titleAr: "titleArLabel",
  titleEn: "titleEnLabel",
  deliverableAr: "deliverableLabel",
  subGoalId: "subGoalLabel",
  ownerOrgUnitId: "ownerLabel",
  budgetNote: "budgetLabel",
  statusCode: "statusLabel",
  startDate: "startDateLabel",
  endDate: "endDateLabel",
};

/**
 * Editor for the initiative's OWN card fields, beneath the printed card.
 *
 * Its reason to exist: both add-initiative forms now demand every field
 * except the definition, but initiatives entered before that rule can be
 * missing any of them and nothing in the app could edit them at all. So this
 * screen both fills the gap and NAMES it - the banner lists what is still
 * blank and each field carries a mark - while still accepting a partial save,
 * since an old card is completed a field at a time.
 */
export function InitiativeCardEditor({
  initiativeId,
  initial,
  subGoalOptions,
  orgUnitOptions,
  statusOptions,
}: {
  initiativeId: string;
  initial: InitiativeCardFormValues;
  subGoalOptions: Array<{ id: string; title: string }>;
  orgUnitOptions: Array<{ id: string; name: string }>;
  statusOptions: Array<{ code: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
  const [values, setValues] = useState<InitiativeCardFormValues>(initial);
  const [state, formAction, pending] = useActionState<InitiativeCardState, FormData>(updateInitiativeCard, null);
  const [handled, setHandled] = useState<InitiativeCardState>(null);
  const [saved, setSaved] = useState<InitiativeCardFormValues>(initial);

  // Derived during render, never in an effect (react-hooks/set-state-in-effect).
  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") setSaved(values);
  }

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  const set = (key: keyof InitiativeCardFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Computed from what is on screen right now, so a blank leaves the list as
  // it is typed - not only after saving.
  const missing = missingInitiativeFields(values);
  const dirty = (Object.keys(values) as Array<keyof InitiativeCardFormValues>).some((k) => values[k] !== saved[k]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const mark = (key: InitiativeFieldKey) =>
    missing.includes(key) ? (
      <span
        style={{
          marginInlineStart: 6,
          fontSize: 11,
          fontWeight: 700,
          color: "var(--sru-danger, #b91c1c)",
          border: "1px solid currentColor",
          borderRadius: 999,
          padding: "0 6px",
        }}
      >
        {t("missingMark")}
      </span>
    ) : null;

  return (
    <form className="no-print" onSubmit={handleSubmit} style={{ marginTop: 20 }}>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <input type="hidden" name="startDate" value={values.startDate} />
      <input type="hidden" name="endDate" value={values.endDate} />

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Pencil size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("cardEditHeading")}</h3>
            <span>{t("cardEditSubtitle")}</span>
          </div>
        </div>

        {missing.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              background: "var(--sru-warning-bg, #fff7ed)",
              border: "1px solid var(--sru-warning, #f59e0b)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            <AlertCircle size={16} aria-hidden style={{ flex: "0 0 auto", marginTop: 3 }} />
            <span>
              <strong>{t("missingHeading", { count: missing.length })}</strong>{" "}
              {missing.map((key) => t(labelKeys[key])).join("، ")}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              color: "var(--sru-success, #15803d)",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            <CheckCircle2 size={16} aria-hidden />
            <span>{t("missingNone")}</span>
          </div>
        )}

        <div className="sru-formgrid">
          <div className="sru-field">
            <label>
              {t("codeLabel")}
              {mark("code")}
            </label>
            <input
              type="text"
              name="code"
              dir="ltr"
              style={{ textAlign: "left" }}
              value={values.code}
              onChange={(e) => set("code")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("horizonLabel")}
              {mark("horizon")}
            </label>
            <input
              type="text"
              name="horizon"
              dir="ltr"
              style={{ textAlign: "left" }}
              value={values.horizon}
              onChange={(e) => set("horizon")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("titleArLabel")}
              {mark("titleAr")}
            </label>
            <input
              type="text"
              name="titleAr"
              required
              dir="rtl"
              value={values.titleAr}
              onChange={(e) => set("titleAr")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("titleEnLabel")}
              {mark("titleEn")}
            </label>
            <input
              type="text"
              name="titleEn"
              dir="ltr"
              style={{ textAlign: "left" }}
              value={values.titleEn}
              onChange={(e) => set("titleEn")(e.target.value)}
            />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>
              {t("deliverableLabel")}
              {mark("deliverableAr")}
            </label>
            <input
              type="text"
              name="deliverableAr"
              dir="rtl"
              value={values.deliverableAr}
              onChange={(e) => set("deliverableAr")(e.target.value)}
            />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            {/* No mark: the definition is the one optional field. */}
            <label>{t("definitionLabel")}</label>
            <textarea
              name="descriptionAr"
              rows={3}
              dir="rtl"
              value={values.descriptionAr}
              onChange={(e) => set("descriptionAr")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("subGoalLabel")}
              {mark("subGoalId")}
            </label>
            <select name="subGoalId" value={values.subGoalId} onChange={(e) => set("subGoalId")(e.target.value)}>
              <option value="">{t("subGoalPlaceholder")}</option>
              {subGoalOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>
              {t("ownerLabel")}
              {mark("ownerOrgUnitId")}
            </label>
            <select name="ownerOrgUnitId" value={values.ownerOrgUnitId} onChange={(e) => set("ownerOrgUnitId")(e.target.value)}>
              <option value="">{t("ownerPlaceholder")}</option>
              {orgUnitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>
              {t("budgetLabel")}
              {mark("budgetNote")}
            </label>
            <input
              type="text"
              name="budgetNote"
              dir="rtl"
              value={values.budgetNote}
              onChange={(e) => set("budgetNote")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("statusLabel")}
              {mark("statusCode")}
            </label>
            <select name="statusCode" required value={values.statusCode} onChange={(e) => set("statusCode")(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>
              {t("startDateLabel")}
              {mark("startDate")}
            </label>
            <DateFieldDmy value={values.startDate} onChange={set("startDate")} ariaLabel={t("startDateLabel")} />
          </div>
          <div className="sru-field">
            <label>
              {t("endDateLabel")}
              {mark("endDate")}
            </label>
            <DateFieldDmy value={values.endDate} onChange={set("endDate")} ariaLabel={t("endDateLabel")} />
          </div>
        </div>
      </section>

      {state?.status === "error" && (
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 13, marginTop: 10 }}>
          {t(errorKeys[state.message] ?? "cardErrorUnknown")}
        </p>
      )}
      {state?.status === "success" && !dirty && (
        <p style={{ color: "var(--sru-success, #15803d)", fontSize: 13, marginTop: 10 }}>{t("cardSaved")}</p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending || !dirty} className="sru-btn sru-btn-primary">
          {pending ? t("cardSaving") : t("cardSave")}
        </button>
      </div>
    </form>
  );
}
