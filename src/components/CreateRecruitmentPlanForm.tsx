"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CalendarRange } from "lucide-react";
import {
  createRecruitmentPlan,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateYear",
  unknown: "errorUnknown",
};

export function CreateRecruitmentPlanForm({ defaultYear }: { defaultYear: number }) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [planYear, setPlanYear] = useState(String(defaultYear));
  const [notes, setNotes] = useState("");

  function submit() {
    startTransition(async () => {
      const result = await createRecruitmentPlan(nameAr, Number(planYear), notes);
      setState(result);
      if (result.status === "success") {
        setNameAr("");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <CalendarRange size={16} aria-hidden />
        </span>
        <h2>{t("newPlanHeading")}</h2>
      </div>

      <div className="sru-formgrid">
        <label className="sru-field">
          <span>{t("fieldPlanName")}</span>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
        </label>
        <label className="sru-field">
          <span>{t("fieldPlanYear")}</span>
          <input
            type="number"
            min={2020}
            max={2100}
            dir="ltr"
            value={planYear}
            onChange={(e) => setPlanYear(e.target.value)}
            required
          />
        </label>
        <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
          <span>{t("fieldNotes")}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="sru-form-submitrow">
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          disabled={pending || nameAr.trim() === "" || planYear.trim() === ""}
          onClick={submit}
        >
          {pending ? t("creating") : t("createPlanButton")}
        </button>
        {state?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[state.message] ?? "errorUnknown")}
          </span>
        )}
        {state?.status === "success" && (
          <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
            {t("planCreated")}
          </span>
        )}
      </div>
    </div>
  );
}
