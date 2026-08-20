"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import {
  addRecruitmentPlanItem,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";
import {
  recruitmentQuarters,
  recruitmentQuarterLabels,
  recruitmentPriorities,
  recruitmentPriorityLabels,
} from "@/lib/recruitmentPlan";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateItem",
  unknown: "errorUnknown",
};

export function AddRecruitmentPlanItemForm({
  planId,
  orgUnits,
  jobTitles,
}: {
  planId: string;
  orgUnits: Array<{ id: string; name_ar: string }>;
  jobTitles: Array<{ id: string; name_ar: string; grade_level: number }>;
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);

  const [orgUnitId, setOrgUnitId] = useState("");
  const [jobTitleId, setJobTitleId] = useState("");
  const [jobTitleQuery, setJobTitleQuery] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [quarter, setQuarter] = useState("");
  const [priority, setPriority] = useState("");
  const [cost, setCost] = useState("");
  const [justification, setJustification] = useState("");

  // Same search-narrows-the-select pattern as the other ~359-option job-title
  // pickers in this app (career path, promotions, vacancies).
  const filteredJobTitles = useMemo(() => {
    const q = jobTitleQuery.trim();
    if (!q) return jobTitles;
    return jobTitles.filter((jt) => includesIgnoringHamza(jt.name_ar, q));
  }, [jobTitles, jobTitleQuery]);

  // Derived during render, not an effect: a selection the current search no
  // longer matches is dropped rather than left hidden-but-submitted.
  const effectiveJobTitleId = filteredJobTitles.some((jt) => jt.id === jobTitleId) ? jobTitleId : "";

  function submit() {
    setState(null);
    startTransition(async () => {
      const result = await addRecruitmentPlanItem({
        planId,
        orgUnitId,
        jobTitleId: effectiveJobTitleId || undefined,
        headcount: Number(headcount),
        targetQuarter: quarter ? Number(quarter) : undefined,
        priority: priority || undefined,
        estimatedMonthlyCost: cost.trim() === "" ? undefined : Number(cost),
        justification: justification || undefined,
      });
      setState(result);
      if (result.status === "success") {
        setJobTitleId("");
        setJustification("");
        setCost("");
        setHeadcount("1");
        dialogRef.current?.close();
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* A button, not a permanently open form. Adding an item is occasional,
          and the expanded form pushed the plan's own items — the reason to
          open this page — below the fold. Same native <dialog> the create-plan
          and Excel-import panels already use, so Escape and the backdrop come
          from the platform rather than being re-implemented. */}
      <button
        type="button"
        className="sru-btn sru-btn-primary"
        onClick={() => {
          setState(null);
          dialogRef.current?.showModal();
        }}
      >
        <Plus size={15} aria-hidden style={{ verticalAlign: "-2px", marginLeft: 4 }} />
        {t("addItemTrigger")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        // Wider than the default modal: this form is a two-column grid, and
        // squeezing it into 520px would stack every field into one column.
        style={{ width: "min(760px, calc(100vw - 32px))" }}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Plus size={16} aria-hidden />
        </span>
        <h2 style={{ flex: 1 }}>{t("addItemHeading")}</h2>
        <button
          type="button"
          className="sru-modal-close"
          onClick={() => dialogRef.current?.close()}
          aria-label={t("closeButton")}
        >
          ×
        </button>
      </div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 10 }}>{t("addItemNote")}</p>

      <div className="sru-formgrid">
        <label className="sru-field">
          <span>{t("fieldOrgUnit")}</span>
          <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} required>
            <option value="">{t("selectPlaceholder")}</option>
            {orgUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name_ar}
              </option>
            ))}
          </select>
        </label>

        <label className="sru-field">
          <span>{t("fieldJobTitleSearch")}</span>
          <input
            value={jobTitleQuery}
            onChange={(e) => setJobTitleQuery(e.target.value)}
            placeholder={t("jobTitleSearchPlaceholder")}
          />
        </label>

        <label className="sru-field">
          <span>{t("fieldJobTitle")}</span>
          <select
            value={effectiveJobTitleId}
            onChange={(e) => setJobTitleId(e.target.value)}
            disabled={filteredJobTitles.length === 0}
          >
            <option value="">
              {filteredJobTitles.length === 0 ? t("jobTitleNoMatches") : t("selectPlaceholder")}
            </option>
            {filteredJobTitles.map((jt) => (
              <option key={jt.id} value={jt.id}>
                {jt.name_ar} ({jt.grade_level})
              </option>
            ))}
          </select>
        </label>

        <label className="sru-field">
          <span>{t("fieldHeadcount")}</span>
          <input
            type="number"
            min={1}
            dir="ltr"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            required
          />
        </label>

        <label className="sru-field">
          <span>{t("fieldQuarter")}</span>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            <option value="">{t("selectPlaceholder")}</option>
            {recruitmentQuarters.map((q) => (
              <option key={q} value={q}>
                {recruitmentQuarterLabels[q]}
              </option>
            ))}
          </select>
        </label>

        <label className="sru-field">
          <span>{t("fieldPriority")}</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">{t("selectPlaceholder")}</option>
            {recruitmentPriorities.map((p) => (
              <option key={p} value={p}>
                {recruitmentPriorityLabels[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="sru-field">
          <span>{t("fieldMonthlyCost")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder={t("monthlyCostPlaceholder")}
          />
        </label>

        <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
          <span>{t("fieldJustification")}</span>
          <input value={justification} onChange={(e) => setJustification(e.target.value)} />
        </label>
      </div>

      <div className="sru-form-submitrow">
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          disabled={pending || orgUnitId === "" || headcount.trim() === ""}
          onClick={submit}
        >
          {pending ? t("adding") : t("addItemButton")}
        </button>
        {state?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[state.message] ?? "errorUnknown")}
          </span>
        )}
        {/* No success message here: the dialog closes on success and the new
            item appears in the table behind it, which says it better. */}
        <button type="button" className="sru-btn" disabled={pending} onClick={() => dialogRef.current?.close()}>
          {t("cancelButton")}
        </button>
      </div>
      </dialog>
    </>
  );
}
