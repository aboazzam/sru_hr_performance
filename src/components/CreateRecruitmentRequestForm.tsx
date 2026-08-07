"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Briefcase, ClipboardList, Sparkles } from "lucide-react";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import {
  createRecruitmentRequest,
  type RecruitmentRequestActionState,
} from "@/app/[locale]/(app)/recruitment/requests/actions";

interface OrgUnitOption {
  id: string;
  name_ar: string;
}
interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number | null;
}
interface CompetencyOption {
  id: string;
  name_ar: string;
  type: string;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  no_profile: "errorNoProfile",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * نموذج طلب الاحتياج. Sectioned the same way as EmployeeInviteForm, the
 * project's reference multi-field form.
 *
 * The job-title list is ~360 rows, so it carries the established
 * search-narrows-the-select treatment (hamza-insensitive, matching every
 * other job-title picker in this app) rather than an unfiltered dropdown.
 * A title genuinely absent from the catalogue can be typed as free text
 * instead — exactly one of the two is required, mirroring the DB's own
 * `recruitment_requests_job_title_source` CHECK.
 */
export function CreateRecruitmentRequestForm({
  orgUnits,
  jobTitles,
  competencies,
}: {
  orgUnits: OrgUnitOption[];
  jobTitles: JobTitleOption[];
  competencies: CompetencyOption[];
}) {
  const t = useTranslations("RecruitmentRequestsPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentRequestActionState | null>(null);

  const [orgUnitId, setOrgUnitId] = useState(orgUnits[0]?.id ?? "");
  const [useCustomTitle, setUseCustomTitle] = useState(false);
  const [jobTitleSearch, setJobTitleSearch] = useState("");
  const [jobTitleId, setJobTitleId] = useState("");
  const [customJobTitle, setCustomJobTitle] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [requestReason, setRequestReason] = useState("vacant");
  const [contractType, setContractType] = useState("permanent");
  const [proposedQuarter, setProposedQuarter] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [strategicProjectRef, setStrategicProjectRef] = useState("");
  const [competencyIds, setCompetencyIds] = useState<string[]>([]);

  const filteredJobTitles = useMemo(
    () =>
      jobTitleSearch.trim() === ""
        ? jobTitles
        : jobTitles.filter((title) => includesIgnoringHamza(title.name_ar, jobTitleSearch)),
    [jobTitles, jobTitleSearch]
  );

  // Derived during render, not in an effect: a selection the current search
  // no longer matches is dropped rather than left hidden-but-submitted.
  const effectiveJobTitleId = filteredJobTitles.some((title) => title.id === jobTitleId)
    ? jobTitleId
    : "";

  const titleChosen = useCustomTitle ? customJobTitle.trim() !== "" : effectiveJobTitleId !== "";
  const canSubmit = orgUnitId !== "" && titleChosen && headcount.trim() !== "" && !pending;

  function toggleCompetency(id: string) {
    setCompetencyIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await createRecruitmentRequest({
        orgUnitId,
        jobTitleId: useCustomTitle ? undefined : effectiveJobTitleId || undefined,
        customJobTitle: useCustomTitle ? customJobTitle : undefined,
        headcount: Number(headcount),
        requestReason: requestReason as "vacant" | "expansion" | "replacement",
        contractType: contractType as "permanent" | "temporary" | "part_time",
        proposedQuarter: proposedQuarter ? Number(proposedQuarter) : undefined,
        qualifications: qualifications || undefined,
        estimatedCostByRequester: estimatedCost ? Number(estimatedCost) : undefined,
        strategicProjectRef: strategicProjectRef || undefined,
        competencyIds: competencyIds.length > 0 ? competencyIds : undefined,
      });
      setState(result);
      if (result.status === "success") {
        router.push("/recruitment/requests");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Briefcase size={16} aria-hidden />
          </span>
          <h2>{t("sectionJob")}</h2>
        </div>

        <div className="sru-formgrid">
          <label className="sru-field">
            <span>{t("fieldOrgUnit")}</span>
            <select value={orgUnitId} onChange={(event) => setOrgUnitId(event.target.value)} required>
              {orgUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name_ar}
                </option>
              ))}
            </select>
          </label>

          <label className="sru-field">
            <span>{t("fieldHeadcount")}</span>
            <input
              type="number"
              min={1}
              max={1000}
              dir="ltr"
              value={headcount}
              onChange={(event) => setHeadcount(event.target.value)}
              required
            />
          </label>

          <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <span>
              <input
                type="checkbox"
                checked={useCustomTitle}
                onChange={(event) => setUseCustomTitle(event.target.checked)}
                style={{ marginInlineEnd: 6 }}
              />
              {t("useCustomTitle")}
            </span>
          </label>

          {useCustomTitle ? (
            <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
              <span>{t("fieldCustomJobTitle")}</span>
              <input
                value={customJobTitle}
                onChange={(event) => setCustomJobTitle(event.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label className="sru-field">
                <span>{t("fieldJobTitleSearch")}</span>
                <input
                  value={jobTitleSearch}
                  onChange={(event) => setJobTitleSearch(event.target.value)}
                  placeholder={t("jobTitleSearchPlaceholder")}
                />
              </label>
              <label className="sru-field">
                <span>{t("fieldJobTitle")}</span>
                <select
                  value={effectiveJobTitleId}
                  onChange={(event) => setJobTitleId(event.target.value)}
                  disabled={filteredJobTitles.length === 0}
                  required
                >
                  <option value="">
                    {filteredJobTitles.length === 0 ? t("jobTitleNoMatches") : t("selectJobTitle")}
                  </option>
                  {filteredJobTitles.map((title) => (
                    <option key={title.id} value={title.id}>
                      {title.name_ar}
                      {title.grade_level ? ` (${title.grade_level})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="sru-field">
            <span>{t("fieldReason")}</span>
            <select value={requestReason} onChange={(event) => setRequestReason(event.target.value)}>
              <option value="vacant">{t("reasonVacant")}</option>
              <option value="expansion">{t("reasonExpansion")}</option>
              <option value="replacement">{t("reasonReplacement")}</option>
            </select>
          </label>

          <label className="sru-field">
            <span>{t("fieldContract")}</span>
            <select value={contractType} onChange={(event) => setContractType(event.target.value)}>
              <option value="permanent">{t("contractPermanent")}</option>
              <option value="temporary">{t("contractTemporary")}</option>
              <option value="part_time">{t("contractPartTime")}</option>
            </select>
          </label>

          <label className="sru-field">
            <span>{t("fieldQuarter")}</span>
            <select value={proposedQuarter} onChange={(event) => setProposedQuarter(event.target.value)}>
              <option value="">{t("quarterUnset")}</option>
              <option value="1">{t("quarter1")}</option>
              <option value="2">{t("quarter2")}</option>
              <option value="3">{t("quarter3")}</option>
              <option value="4">{t("quarter4")}</option>
            </select>
          </label>

          <label className="sru-field">
            <span>{t("fieldEstimatedCost")}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={estimatedCost}
              onChange={(event) => setEstimatedCost(event.target.value)}
            />
          </label>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 8 }}>{t("costHint")}</p>
      </div>

      <div className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <ClipboardList size={16} aria-hidden />
          </span>
          <h2>{t("sectionRequirements")}</h2>
        </div>

        <div className="sru-formgrid">
          <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <span>{t("fieldQualifications")}</span>
            <textarea
              rows={3}
              value={qualifications}
              onChange={(event) => setQualifications(event.target.value)}
            />
          </label>
          <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <span>{t("fieldStrategicProject")}</span>
            <input
              value={strategicProjectRef}
              onChange={(event) => setStrategicProjectRef(event.target.value)}
            />
          </label>
        </div>
      </div>

      {competencies.length > 0 && (
        <div className="sru-formsection">
          <div className="sru-formsection-head">
            <span className="sru-formsection-badge">
              <Sparkles size={16} aria-hidden />
            </span>
            <h2>{t("sectionCompetencies")}</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {competencies.map((competency) => (
              <label key={competency.id} style={{ fontSize: 13, display: "flex", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={competencyIds.includes(competency.id)}
                  onChange={() => toggleCompetency(competency.id)}
                />
                <span>{competency.name_ar}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="sru-form-submitrow">
        <button type="button" className="sru-btn sru-btn-primary" disabled={!canSubmit} onClick={submit}>
          {pending ? t("saving") : t("createRequestButton")}
        </button>
        {state?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[state.message] ?? "errorUnknown")}
          </span>
        )}
      </div>
    </div>
  );
}
