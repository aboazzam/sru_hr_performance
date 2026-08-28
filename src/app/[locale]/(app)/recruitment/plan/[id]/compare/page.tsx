import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/BackLink";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { computeRecruitmentPlanTotals } from "@/lib/recruitmentPlan";
import { computeDistribution } from "@/lib/recruitmentPlanAnalytics";
import { comparePlans } from "@/lib/recruitmentPlanComparison";
import type { Locale } from "@/i18n/config";

// مقارنة بخطة سابقة، side by side per org unit.
//
// WHICH plan to compare against is the reader's choice (`?with=`), asked for
// directly: "تظهر له الخطط السابقة فيختار منها فتتم المطابقة". A year is not
// always the right axis — a university may skip a year, or want this year
// measured against one two years back.
//
// With nothing chosen it still resolves as it always did, so the button lands
// on a real comparison rather than an empty picker: an explicit
// `previous_plan_id` link if one was set, otherwise the plan for
// `plan_year - 1`. The explicit link wins because inferring "last year" would
// silently compare against nothing while looking like it compared against
// something.
export default async function PlanComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { locale, id } = await params;
  const { with: requestedId } = await searchParams;
  const t = await getTranslations("RecruitmentComparePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: Partial<Record<ProcessArea, VpraLevel>> = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  const canView =
    hasVpraAccess(permissions.recruitmentPlan ?? "none", "view") ||
    hasVpraAccess(permissions.recruitmentBudget ?? "none", "view");

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, name_ar, plan_year, previous_plan_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  // Every other plan this caller may read — the choices offered. RLS decides
  // what is in here, so the picker can never name a plan the reader could not
  // open anyway.
  const { data: candidateRows } = canView && plan
    ? await supabase
        .from("recruitment_plans")
        .select("id, name_ar, plan_year")
        .neq("id", plan.id)
        .is("deleted_at", null)
        .order("plan_year", { ascending: false })
    : { data: null };
  const candidates = candidateRows ?? [];

  let previous: { id: string; name_ar: string; plan_year: number } | null = null;
  if (canView && plan) {
    // The requested id is honoured only if it is one of the choices above —
    // so a hand-edited `?with=` cannot reach a plan RLS hides, and a stale
    // link to a since-deleted plan falls back instead of erroring.
    const requested = requestedId ? candidates.find((c) => c.id === requestedId) : undefined;
    if (requested) {
      previous = requested;
    } else if (plan.previous_plan_id) {
      previous = candidates.find((c) => c.id === plan.previous_plan_id) ?? null;
    } else {
      previous = candidates.find((c) => c.plan_year === plan.plan_year - 1) ?? null;
    }
  }

  const loadItems = async (planId: string) => {
    const { data } = await supabase
      .from("recruitment_plan_items")
      .select("headcount, estimated_monthly_cost, org_units(name_ar)")
      .eq("plan_id", planId)
      .is("deleted_at", null);
    return ((data ?? []) as unknown as Array<{
      headcount: number;
      estimated_monthly_cost: number | null;
      org_units: { name_ar: string } | null;
    }>).map((row) => ({
      headcount: row.headcount,
      estimatedMonthlyCost: row.estimated_monthly_cost,
      groupKey: row.org_units?.name_ar ?? null,
      groupLabel: row.org_units?.name_ar ?? null,
    }));
  };

  const currentItems = canView && plan ? await loadItems(plan.id) : [];
  const previousItems = previous ? await loadItems(previous.id) : [];

  const rows = comparePlans(computeDistribution(currentItems), computeDistribution(previousItems));
  const currentTotals = computeRecruitmentPlanTotals(currentItems);
  const previousTotals = computeRecruitmentPlanTotals(previousItems);

  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const delta = (value: number) => (value > 0 ? `+${formatNumber(value)}` : formatNumber(value));
  const deltaColor = (value: number) =>
    value > 0 ? "#b45309" : value < 0 ? "#15803d" : "var(--sru-muted)";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ marginBottom: 10 }}>
        <BackLink href={`/recruitment/plan/${id}`}>{t("backToPlan")}</BackLink>
      </div>

      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      {plan && (
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
          {plan.name_ar} — {plan.plan_year}
        </p>
      )}
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      {/* The picker. A plain GET form — no client JS for what is one select
          and a submit, the same approach the employees and requests filters
          use. `previous?.id` preselects whatever is actually being compared,
          so the control always shows the truth rather than a blank. */}
      {canView && plan && candidates.length > 0 && (
        <form
          method="get"
          style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <label className="sru-field" style={{ minWidth: 260 }}>
            <span>{t("pickLabel")}</span>
            <select name="with" defaultValue={previous?.id ?? ""}>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name_ar} — {candidate.plan_year}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="sru-btn sru-btn-primary">
            {t("pickSubmit")}
          </button>
        </form>
      )}

      <div style={{ marginTop: 20 }}>
        {!canView ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("forbidden")}</p>
        ) : !plan ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("planNotFound")}</p>
        ) : candidates.length === 0 ? (
          // Nothing to compare against at all — a real answer, not an error,
          // and not a table of zeroes pretending to be one.
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noOtherPlans")}</p>
        ) : !previous ? (
          // Other plans exist but none is picked yet, so say which move is
          // missing rather than repeating "nothing to compare".
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("pickNone")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="sru-card">
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>
                    {t("headcountThisYear", { year: plan.plan_year })}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700 }}>
                    {formatNumber(currentTotals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>
                    {t("headcountLastYear", { year: previous.plan_year })}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700 }}>
                    {formatNumber(previousTotals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("headcountDelta")}</div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      color: deltaColor(currentTotals.totalHeadcount - previousTotals.totalHeadcount),
                    }}
                  >
                    {delta(currentTotals.totalHeadcount - previousTotals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("costDelta")}</div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      color: deltaColor(currentTotals.totalAnnualCost - previousTotals.totalAnnualCost),
                    }}
                  >
                    {delta(currentTotals.totalAnnualCost - previousTotals.totalAnnualCost)}
                  </div>
                </div>
              </div>
            </div>

            <div className="sru-card">
              <div className="table-scroll">
                <table className="admin-matrix">
                  <thead>
                    <tr>
                      <th>{t("columnOrgUnit")}</th>
                      <th>{t("columnHeadcountPrev", { year: previous.plan_year })}</th>
                      <th>{t("columnHeadcountCurrent", { year: plan.plan_year })}</th>
                      <th>{t("columnHeadcountDelta")}</th>
                      <th>{t("columnCostPrev")}</th>
                      <th>{t("columnCostCurrent")}</th>
                      <th>{t("columnCostDelta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td className="sru-en">{formatNumber(row.previousHeadcount)}</td>
                        <td className="sru-en">{formatNumber(row.currentHeadcount)}</td>
                        <td className="sru-en" style={{ color: deltaColor(row.headcountDelta) }}>
                          {delta(row.headcountDelta)}
                        </td>
                        <td className="sru-en">{formatNumber(row.previousAnnualCost)}</td>
                        <td className="sru-en">{formatNumber(row.currentAnnualCost)}</td>
                        <td className="sru-en" style={{ color: deltaColor(row.annualCostDelta) }}>
                          {delta(row.annualCostDelta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
