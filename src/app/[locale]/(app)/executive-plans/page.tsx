import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { NewExecutivePlanForm } from "@/components/NewExecutivePlanForm";
import { formatDateDmy } from "@/lib/dateParts";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { Locale } from "@/i18n/config";
import { ExecutivePlanCard, type ExecutivePlanCardData } from "@/components/ExecutivePlanCard";
import { executivePlanStatusLabel } from "@/lib/executivePlanStatus";
import { isInWindow } from "@/lib/executivePlanScope";

interface ExecutivePlanRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  start_date: string;
  end_date: string;
  status: string;
  cycle_id: string | null;
  strategic_plan_id: string;
}

/**
 * الخطة التشغيلية — the module's first tab, deliberately shaped like the
 * strategic-plans list it mirrors ("اول تاب شبيه بقائمة الخطط الاستراتيجية").
 *
 * Viewing is open to every authenticated user (executive_plans_select is
 * `USING (true)`, the same decision already taken for strategic_plans in
 * 20260801000001 — the name and window are administrative metadata, while
 * the sensitive content keeps its own narrower RLS). Creating is gated at
 * strategicPlanning='approve', matching executive_plans_insert.
 */
export default async function ExecutivePlansPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations("ExecutivePlansPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(level, "approve");

  const { data } = await supabase
    .from("executive_plans")
    .select("id, name_ar, name_en, start_date, end_date, status, cycle_id, strategic_plan_id")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  const plans = (data ?? []) as ExecutivePlanRow[];

  const { data: strategicPlansData } = await supabase
    .from("strategic_plans")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });
  const strategicPlans = ((strategicPlansData ?? []) as Array<{ id: string; name_ar: string }>).map((p) => ({
    id: p.id,
    nameAr: p.name_ar,
  }));
  const strategicPlanNameById = new Map(strategicPlans.map((p) => [p.id, p.nameAr]));

  // Cycles are optional here: production has none yet, and the create form
  // says so rather than presenting an empty dropdown with no explanation.
  const { data: cyclesData } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  const cycles = ((cyclesData ?? []) as Array<{ id: string; name_ar: string; start_date: string; end_date: string }>).map((c) => ({
    id: c.id,
    nameAr: c.name_ar,
    startDate: c.start_date,
    endDate: c.end_date,
  }));
  const cycleNameById = new Map(cycles.map((c) => [c.id, c.nameAr]));

  // The ring shows what the plan's WINDOW contains: an executive plan owns no
  // progress of its own, so its achievement is that of the strategic plan's
  // initiatives falling inside its dates. Read through the caller's own
  // client, so an initiative they cannot see does not count toward a number
  // they are shown.
  const { data: initiativeRows } = await supabase
    .from("strategic_initiatives")
    .select("plan_id, start_date, end_date, progress_percent, status_code")
    .is("deleted_at", null);
  const initiatives = (initiativeRows ?? []) as Array<{
    plan_id: string;
    start_date: string | null;
    end_date: string | null;
    progress_percent: number | string | null;
    status_code: string | null;
  }>;

  // One "today" for every card, taken on the server: a per-card new Date()
  // could straddle midnight mid-render.
  const todayIso = new Date().toISOString().slice(0, 10);

  const cards: ExecutivePlanCardData[] = plans.map((plan) => ({
    id: plan.id,
    nameAr: plan.name_ar,
    nameEn: plan.name_en,
    strategicPlanId: plan.strategic_plan_id,
    strategicPlanName: strategicPlanNameById.get(plan.strategic_plan_id) ?? "—",
    cycleId: plan.cycle_id,
    cycleName: plan.cycle_id ? cycleNameById.get(plan.cycle_id) ?? null : null,
    startDate: plan.start_date,
    endDate: plan.end_date,
    status: plan.status,
    statusLabel: executivePlanStatusLabel(plan.status),
    periodLabel: `${formatDateDmy(plan.start_date, locale)} — ${formatDateDmy(plan.end_date, locale)}`,
    initiatives: initiatives
      .filter(
        (i) =>
          i.plan_id === plan.strategic_plan_id &&
          isInWindow({ startDate: i.start_date, endDate: i.end_date }, { startDate: plan.start_date, endDate: plan.end_date })
      )
      .map((i) => ({ progressPercent: i.progress_percent, statusCode: i.status_code })),
  }));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="executivePlan" current="executive-plans" />

      <div
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {canCreate && strategicPlans.length > 0 && (
          <div className="sru-actionbar no-print" style={{ flex: "0 0 auto" }}>
            <NewExecutivePlanForm strategicPlans={strategicPlans} cycles={cycles} />
          </div>
        )}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {canCreate && strategicPlans.length === 0 && (
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 16 }}>{t("noStrategicPlans")}</p>
      )}

      {plans.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {cards.map((plan) => (
            <ExecutivePlanCard
              key={plan.id}
              plan={plan}
              canManage={canCreate}
              todayIso={todayIso}
              strategicPlans={strategicPlans}
              cycles={cycles.map((c) => ({ id: c.id, nameAr: c.nameAr }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
