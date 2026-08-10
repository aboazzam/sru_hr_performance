"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Briefcase, ClipboardList, Sparkles } from "lucide-react";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import {
  CompetencyLevelPicker,
  countMissingLevels,
  sameSelection,
  toSavedCompetencies,
  type CompetencyDraft,
  type CompetencyOption,
  type SelectedCompetency,
} from "@/components/CompetencyLevelPicker";
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
  qualification_required?: string | null;
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
  competenciesByJobTitle = {},
}: {
  orgUnits: OrgUnitOption[];
  jobTitles: JobTitleOption[];
  competencies: CompetencyOption[];
  /** Competencies already recorded against each catalogue job title, with the level that title requires. */
  competenciesByJobTitle?: Record<string, SelectedCompetency[]>;
}) {
  const t = useTranslations("RecruitmentRequestsPage");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentRequestActionState | null>(null);

  // Tracks the SAVE only — never the navigation that follows it.
  //
  // Reported live: the button stayed on "جارٍ الحفظ..." indefinitely even
  // though the request was created correctly. `useTransition`'s `pending`
  // stays true until everything inside the transition settles, and this one
  // ended with `router.push()` + `router.refresh()` — so the label was
  // reporting the route change, not the save, and appeared stuck for as long
  // as the destination took to render.
  //
  // Cleared in `finally`, so a failed save can never strand the button either.
  const [saving, setSaving] = useState(false);

  const [orgUnitId, setOrgUnitId] = useState(orgUnits[0]?.id ?? "");
  const [useCustomTitle, setUseCustomTitle] = useState(false);
  const [jobTitleSearch, setJobTitleSearch] = useState("");
  const [jobTitleId, setJobTitleId] = useState("");
  const [customJobTitle, setCustomJobTitle] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [requestReason, setRequestReason] = useState("vacant");
  const [contractType, setContractType] = useState("permanent");
  const [proposedQuarter, setProposedQuarter] = useState("");
  /** "" = غير مشترط. القيم المخزّنة Male/Female كما في profiles.gender. */
  const [gender, setGender] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [strategicProjectRef, setStrategicProjectRef] = useState("");
  const [selectedCompetencies, setSelectedCompetencies] = useState<CompetencyDraft[]>([]);

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

  // ---------------------------------------------------------------------------
  // Prefill from the chosen job title (requested 2026-08-07)
  // ---------------------------------------------------------------------------
  // "المؤهلات والجدارات اسحبها من قائمة الوظائف واترك لي إمكانية التغيير" — so
  // both are seeded from the catalogue and stay fully editable.
  //
  // Adjusted DURING RENDER on a changed job title, not in an effect: this
  // repo's `react-hooks/set-state-in-effect` rule rejects the effect form, and
  // the same pattern already backs the vacancy form's requirements prefill.
  //
  // Manual edits are never clobbered: a box the requester typed in themselves
  // is left alone, and only an untouched box (or one still holding what this
  // form filled in for the PREVIOUS title) is replaced.
  const selectedJobTitle = jobTitles.find((title) => title.id === effectiveJobTitleId);
  const titleQualifications = selectedJobTitle?.qualification_required?.trim() ?? "";
  const titleCompetencies = effectiveJobTitleId
    ? (competenciesByJobTitle[effectiveJobTitleId] ?? [])
    : [];

  const [syncedJobTitleId, setSyncedJobTitleId] = useState("");
  const [autoFilledQualifications, setAutoFilledQualifications] = useState("");
  const [autoFilledCompetencies, setAutoFilledCompetencies] = useState<CompetencyDraft[]>([]);

  if (effectiveJobTitleId !== syncedJobTitleId) {
    setSyncedJobTitleId(effectiveJobTitleId);
    if (qualifications.trim() === "" || qualifications === autoFilledQualifications) {
      setQualifications(titleQualifications);
      setAutoFilledQualifications(titleQualifications);
    }
    if (selectedCompetencies.length === 0 || sameSelection(selectedCompetencies, autoFilledCompetencies)) {
      setSelectedCompetencies(titleCompetencies);
      setAutoFilledCompetencies(titleCompetencies);
    }
  }

  /** Lets the requester pull the catalogue values back after editing them. */
  const qualificationsEdited =
    titleQualifications !== "" && qualifications !== autoFilledQualifications;
  const competenciesEdited =
    titleCompetencies.length > 0 && !sameSelection(selectedCompetencies, autoFilledCompetencies);

  function restoreFromJobTitle() {
    setQualifications(titleQualifications);
    setAutoFilledQualifications(titleQualifications);
    setSelectedCompetencies(titleCompetencies);
    setAutoFilledCompetencies(titleCompetencies);
  }

  // A ticked competency with no level cannot be saved. Blocking here rather
  // than quietly dropping it keeps the requester's own choice: they either
  // say what level they mean, or untick it.
  const competenciesMissingLevel = countMissingLevels(selectedCompetencies);
  const canSubmit =
    orgUnitId !== "" &&
    titleChosen &&
    headcount.trim() !== "" &&
    competenciesMissingLevel === 0 &&
    !saving;

  /**
   * حالتان لصاحب الطلب، لا واحدة: «حفظ كمسودة» لطلب لم يكتمل بعد، و«رفع
   * الطلب» يرسله إلى الموارد البشرية فورًا.
   *
   * كان النموذج يحفظ مسودة دائمًا، فيظنّ صاحب الطلب أنه رفعه بينما يقرأ
   * الجميع «مسودة»، ويلزمه رجوعٌ إلى الجدول وضغطةٌ ثانية على زرٍّ يراه غيره
   * أيضًا — وهو ما جعل الموارد البشرية والأدمن يريان «رفع الطلب» بوصفه
   * إجراءهم هم.
   */
  function submit(asSubmitted: boolean) {
    setSaving(true);
    startTransition(async () => {
      try {
        await save(asSubmitted);
      } finally {
        setSaving(false);
      }
    });
  }

  async function save(asSubmitted: boolean) {
      const result = await createRecruitmentRequest({
        submit: asSubmitted,
        orgUnitId,
        jobTitleId: useCustomTitle ? undefined : effectiveJobTitleId || undefined,
        customJobTitle: useCustomTitle ? customJobTitle : undefined,
        headcount: Number(headcount),
        requestReason: requestReason as "vacant" | "expansion" | "replacement",
        contractType: contractType as "permanent" | "temporary" | "part_time",
        proposedQuarter: proposedQuarter ? Number(proposedQuarter) : undefined,
        gender: gender ? (gender as "Male" | "Female") : undefined,
        qualifications: qualifications || undefined,
        estimatedCostByRequester: estimatedCost ? Number(estimatedCost) : undefined,
        strategicProjectRef: strategicProjectRef || undefined,
        // `canSubmit` already refuses an unlevelled row, so this narrowing
        // drops nothing in practice — it is what turns the draft type into
        // the action's own fully-levelled shape without a cast.
        competencies:
          selectedCompetencies.length > 0 ? toSavedCompetencies(selectedCompetencies) : undefined,
      });
      setState(result);
      if (result.status === "success") {
        // `push` already fetches the destination's fresh payload, so the
        // extra `refresh()` that used to follow it only lengthened the
        // transition the button label was tied to.
        router.push("/recruitment/requests");
      }
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

          {/* المسمى الوظيفي أولًا، ثم خيار الإدخال اليدوي بعده — يُبحث ويُختار
              من الكتالوج، وإن لم يوجد فحينئذٍ يُلجأ للكتابة اليدوية. الترتيب
              السابق كان يعرض الخيار الاستثنائي قبل الحالة الطبيعية. */}
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

          <label
            className="sru-field"
            style={{ gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              checked={useCustomTitle}
              onChange={(event) => setUseCustomTitle(event.target.checked)}
            />
            <span style={{ margin: 0 }}>{t("useCustomTitle")}</span>
          </label>

          <label className="sru-field">
            <span>{t("fieldGender")}</span>
            {/* اختياري: غيابه يعني "غير مشترط" لا "غير معروف"، والقيم هي
                نفسها المخزّنة في profiles.gender فلا يتعدد القاموس. */}
            <select value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="">{t("genderUnspecified")}</option>
              <option value="Male">{t("genderMale")}</option>
              <option value="Female">{t("genderFemale")}</option>
            </select>
          </label>

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
            {/* Always say where the text came from — a prefilled box that
                doesn't explain itself reads as data the requester entered. */}
            {selectedJobTitle && titleQualifications !== "" && (
              <span style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
                {t("qualificationsFromJobTitle", { title: selectedJobTitle.name_ar })}
              </span>
            )}
            {selectedJobTitle && titleQualifications === "" && (
              <span style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
                {t("noQualificationsOnJobTitle")}
              </span>
            )}
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
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>
              {selectedJobTitle && titleCompetencies.length > 0
                ? t("competenciesFromJobTitle", {
                    title: selectedJobTitle.name_ar,
                    count: titleCompetencies.length,
                  })
                : t("competenciesPickManually")}
            </span>
            {(qualificationsEdited || competenciesEdited) && (
              <button
                type="button"
                className="sru-btn"
                style={{ fontSize: 12, padding: "2px 10px" }}
                onClick={restoreFromJobTitle}
              >
                {t("restoreFromJobTitle")}
              </button>
            )}
          </div>
          <CompetencyLevelPicker
            competencies={competencies}
            selection={selectedCompetencies}
            onChange={setSelectedCompetencies}
            labels={{
              levelPlaceholder: t("competencyLevelPlaceholder"),
              levelFor: (name) => t("competencyLevelFor", { name }),
            }}
          />

          {competenciesMissingLevel > 0 && (
            <p role="alert" className="text-sm text-red-600" style={{ marginTop: 8 }}>
              {t("competencyLevelsMissing", { count: competenciesMissingLevel })}
            </p>
          )}
        </div>
      )}

      <div className="sru-form-submitrow">
        {/* الرفع هو الفعل المقصود عادةً، فهو الزر الأساسي؛ والمسودة تبقى
            متاحةً بجانبه لطلب لم يكتمل. */}
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          disabled={!canSubmit}
          onClick={() => submit(true)}
        >
          {saving ? t("saving") : t("createAndSubmitButton")}
        </button>
        <button
          type="button"
          className="sru-btn"
          disabled={!canSubmit}
          onClick={() => submit(false)}
        >
          {t("createRequestButton")}
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
