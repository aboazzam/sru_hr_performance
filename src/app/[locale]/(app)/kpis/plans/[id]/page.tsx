import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Flag, Star } from "lucide-react";
import { StrategicIdentityForm } from "@/components/StrategicIdentityForm";
import { StrategicValueRow } from "@/components/StrategicValueRow";
import { AddStrategicValueForm } from "@/components/AddStrategicValueForm";
import { StrategicPlanExcelButtons } from "@/components/StrategicPlanExcelButtons";
import {
  InitiativesPanel,
  type InitiativeStatusOption,
  type InitiativeTargetOption,
  type InitiativeView,
} from "@/components/InitiativesPanel";
import { ProgramsPanel, type ProgramSummary } from "@/components/ProgramsPanel";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { StrategicGoalsFilterBar } from "@/components/StrategicGoalsFilterBar";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

interface StrategicGoalRow {
  id: string;
  title_ar: string;
  weight: number | null;
}

interface SubGoalRow {
  id: string;
  strategic_goal_id: string;
  owner_position_id: string;
  title_ar: string;
  weight: number | null;
}

interface KpiRow {
  id: string;
  strategic_goal_id: string | null;
  sub_goal_id: string | null;
  title_ar: string;
  unit_ar: string;
  plan_target_value: number | null;
  weight: number | null;
}

function describeKpis(list: KpiRow[]): string {
  if (list.length === 0) return "—";
  return list.map((k) => `${k.title_ar} (${k.plan_target_value ?? "—"} ${k.unit_ar})`).join("، ");
}

// The per-plan "working page" requested 2026-08-01 ("اذا ضغطت على اي وحدة
// [خطة] تطلع لي هذه الصفحة واللي فيها اركان الخطة الاستراتيجية وما اسند لي
// منها ودوري في انجاح الخطة"): one page per `strategic_plans` row, with the
// plan's own name shown at the top ("بحيث أعلم أنا شغال على أي خطة") and
// the same four sections already built as separate pages -- بنك الأهداف /
// الأهداف المسندة / الأهداف الاستراتيجية / الرؤية والرسالة والقيم -- now
// reproduced as tabs (via the existing ProfileTabs client component, since
// GroupTabs can't render tabs for a dynamic route segment).
//
// Ungated, same "vision/mission opened to everyone" precedent (20260730000004)
// -- viewing a plan is for all staff; each underlying table's OWN RLS is
// still the real filter (a plain employee outside a goal's cascade chain
// simply sees an empty الأهداف الاستراتيجية tab, same as on /kpis today).
//
// Vision/mission/values and the goal_library catalog are GLOBAL reference
// data with no plan_id column at all (confirmed directly against both
// tables' schema) -- shown here unfiltered, exactly as on their own
// standalone pages, not duplicated per plan. Strategic goals/sub-goals/
// KPIs/targets ARE plan-scoped (strategic_goals.plan_id, NOT NULL since
// 20260730000001) -- filtered to this plan's own goal/sub-goal ids in JS
// after the same RLS-scoped fetches the existing pages already use (small
// reference tables, same "fetch then filter" precedent already used for
// e.g. the cascaded-targets split on /kpis).
export default async function StrategicPlanDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("StrategicPlanDetailPage");
  const tIdentity = await getTranslations("StrategicIdentityPage");
  const tGoals = await getTranslations("StrategicGoalsPage");
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("strategic_plans")
    .select("id, name_ar, name_en, start_year, end_year")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!plan) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <Link
          href="/kpis/plans"
          className="sru-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
        >
          <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
          {t("backToList")}
        </Link>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const strategicPlanningLevel = permissions.strategicPlanning ?? "none";
  const canEditIdentity = hasVpraAccess(strategicPlanningLevel, "prepare");
  const canManageGoals = hasVpraAccess(strategicPlanningLevel, "approve");

  // ---- Vision / Mission / Values: global reference, not plan-scoped ----
  const { data: identity } = await supabase
    .from("strategic_identity")
    .select("vision_ar, vision_en, mission_ar, mission_en")
    .maybeSingle();
  const { data: valuesData } = await supabase
    .from("strategic_values")
    .select("id, title_ar, title_en, description_ar")
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  const values = (valuesData ?? []) as Array<{ id: string; title_ar: string; title_en: string | null; description_ar: string | null }>;

  // ---- This plan's strategic goals / sub-goals / KPIs ----
  const { data: goalsData } = await supabase
    .from("strategic_goals")
    .select("id, title_ar, weight")
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const goals = (goalsData ?? []) as StrategicGoalRow[];
  const goalIds = new Set(goals.map((g) => g.id));

  const { data: subGoalsData } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, owner_position_id, title_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const subGoals = ((subGoalsData ?? []) as SubGoalRow[]).filter((sg) => goalIds.has(sg.strategic_goal_id));
  const subGoalIds = new Set(subGoals.map((sg) => sg.id));

  const { data: kpisData } = await supabase
    .from("strategic_kpis")
    .select("id, strategic_goal_id, sub_goal_id, title_ar, unit_ar, plan_target_value, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const kpis = ((kpisData ?? []) as KpiRow[]).filter(
    (k) => (k.strategic_goal_id != null && goalIds.has(k.strategic_goal_id)) || (k.sub_goal_id != null && subGoalIds.has(k.sub_goal_id))
  );
  const kpisByGoal = new Map<string, KpiRow[]>();
  const kpisBySubGoal = new Map<string, KpiRow[]>();
  for (const k of kpis) {
    const key = k.strategic_goal_id ?? k.sub_goal_id;
    if (!key) continue;
    const map = k.strategic_goal_id ? kpisByGoal : kpisBySubGoal;
    const list = map.get(key) ?? [];
    list.push(k);
    map.set(key, list);
  }

  // list_org_structure_positions(): SECURITY DEFINER RPC, same reason the
  // strategic-goals/goal-library pages use it (org_structure_positions_select's
  // own RLS doesn't cover every role that can reach this page).
  const { data: positions } = await supabase.rpc("list_org_structure_positions");
  const positionNameById = new Map(((positions ?? []) as Array<{ id: string; name_ar: string }>).map((p) => [p.id, p.name_ar]));

  const subGoalsByStrategicGoal = new Map<string, SubGoalRow[]>();
  for (const sg of subGoals) {
    const list = subGoalsByStrategicGoal.get(sg.strategic_goal_id) ?? [];
    list.push(sg);
    subGoalsByStrategicGoal.set(sg.strategic_goal_id, list);
  }

  const identityContent = (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 20 }}>{tIdentity("subtitle")}</p>
      <StrategicIdentityForm canEdit={canEditIdentity} identity={identity ?? null} />
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Star size={17} aria-hidden />
          </span>
          <div>
            <h3>{tIdentity("valuesHeading")}</h3>
          </div>
        </div>
        {values.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{tIdentity("valuesEmpty")}</p>
        ) : (
          values.map((v) => (
            <StrategicValueRow
              key={v.id}
              canEdit={canEditIdentity}
              valueId={v.id}
              initialTitleAr={v.title_ar}
              initialTitleEn={v.title_en}
              initialDescriptionAr={v.description_ar}
            />
          ))
        )}
        {canEditIdentity && <AddStrategicValueForm />}
      </section>
    </div>
  );

  // Owning positions offered by the goals filter — built from the sub-goals
  // on screen, so a position with nothing here is never offered.
  const goalOwnerFilterOptions = Array.from(
    new Map(
      subGoals
        .filter((sg) => positionNameById.get(sg.owner_position_id))
        .map((sg) => [sg.owner_position_id, { id: sg.owner_position_id, label: positionNameById.get(sg.owner_position_id) as string }])
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label, "ar"));

  const goalsContent = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{tGoals("subtitle")}</p>
        <div className="sru-actionbar no-print" style={{ flex: "0 0 auto" }}>
          {canManageGoals && (
            <Link href="/kpis/strategic-goals/new" className="sru-btn sru-btn-primary" style={{ whiteSpace: "nowrap" }}>
              {tGoals("addGoalButton")}
            </Link>
          )}
          <StrategicPlanExcelButtons planId={plan.id} canImport={canManageGoals} />
        </div>
      </div>
      {goals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tGoals("empty")}</p>
      ) : (
        <StrategicGoalsFilterBar
          ownerOptions={goalOwnerFilterOptions}
          goals={goals.map((goal) => ({
            id: goal.id,
            title: goal.title_ar,
            ownerPositionIds: (subGoalsByStrategicGoal.get(goal.id) ?? []).map((sg) => sg.owner_position_id),
            content: (() => {
          const goalSubGoals = subGoalsByStrategicGoal.get(goal.id) ?? [];
          return (
            <div key={goal.id} className="sru-card" style={{ marginBottom: 24, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{goal.title_ar}</strong>
                  {goal.weight != null && (
                    <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>
                      {tGoals("columnWeight")}: {goal.weight}%
                    </p>
                  )}
                </div>
                {canManageGoals && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Link href={`/kpis/manage-kpis?goalId=${goal.id}`} className="sru-btn" style={{ fontSize: 12 }}>
                      {tGoals("manageKpisButton")}
                    </Link>
                    <Link href={`/kpis/strategic-goals/${goal.id}/sub-goals/new`} className="sru-btn" style={{ fontSize: 12 }}>
                      {tGoals("addSubGoalButton")}
                    </Link>
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{tGoals("kpisHeading")}</h4>
              {(kpisByGoal.get(goal.id) ?? []).length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{tGoals("kpisEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{tGoals("columnKpi")}</th>
                        <th>{tGoals("columnUnit")}</th>
                        <th>{tGoals("columnPlanTarget")}</th>
                        <th>{tGoals("columnWeight")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(kpisByGoal.get(goal.id) ?? []).map((k) => (
                        <tr key={k.id}>
                          <td>{k.title_ar}</td>
                          <td>{k.unit_ar}</td>
                          <td>{k.plan_target_value ?? "—"}</td>
                          <td>{k.weight != null ? `${k.weight}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{tGoals("subGoalsHeading")}</h4>
              {goalSubGoals.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{tGoals("subGoalsEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{tGoals("columnTitle")}</th>
                        <th>{tGoals("columnOwner")}</th>
                        <th>{tGoals("columnKpi")}</th>
                        <th>{tGoals("columnWeight")}</th>
                        {canManageGoals && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {goalSubGoals.map((sg) => (
                        <tr key={sg.id}>
                          <td>{sg.title_ar}</td>
                          <td>{positionNameById.get(sg.owner_position_id) ?? "—"}</td>
                          <td>{describeKpis(kpisBySubGoal.get(sg.id) ?? [])}</td>
                          <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
                          {canManageGoals && (
                            <td>
                              <Link
                                href={`/kpis/manage-kpis?subGoalId=${sg.id}`}
                                className="sru-btn"
                                style={{ fontSize: 11.5, padding: "4px 10px" }}
                              >
                                {tGoals("manageKpisButton")}
                              </Link>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
              );
            })(),
          }))}
        />
      )}
    </div>
  );



  // ---- المبادرات: what will actually achieve this plan's targets ----
  // Requested 2026-08-19, placed directly after الأهداف الاستراتيجية ("وبعد
  // اضافة المستهدفات اضف المبادرات"). A link points at either a KPI (its
  // plan-level target) or one annual target — the XOR the link table
  // enforces — so both meanings of "المستهدف" on this screen are covered.
  const { data: initiativesData } = await supabase
    .from("strategic_initiatives")
    .select(
      "id, title_ar, title_en, description_ar, owner_org_unit_id, sub_goal_id, start_date, end_date, status_code, progress_percent"
    )
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const initiativeRows = (initiativesData ?? []) as Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    description_ar: string | null;
    owner_org_unit_id: string | null;
    sub_goal_id: string | null;
    start_date: string | null;
    end_date: string | null;
    status_code: string;
    progress_percent: number | string | null;
  }>;

  const { data: initiativeLinksData } = await supabase
    .from("strategic_initiative_targets")
    .select("id, initiative_id, kpi_id, kpi_annual_target_id")
    .is("deleted_at", null);
  const initiativeLinkRows = ((initiativeLinksData ?? []) as Array<{
    id: string;
    initiative_id: string;
    kpi_id: string | null;
    kpi_annual_target_id: string | null;
  }>).filter((l) => initiativeRows.some((i) => i.id === l.initiative_id));

  const { data: annualTargetsData } = await supabase
    .from("kpi_annual_targets")
    .select("id, kpi_id, cycle_id, target_value")
    .is("deleted_at", null);
  const annualTargetRows = ((annualTargetsData ?? []) as Array<{
    id: string;
    kpi_id: string;
    cycle_id: string;
    target_value: number;
  }>).filter((a) => kpis.some((k) => k.id === a.kpi_id));

  const { data: cyclesData } =
    annualTargetRows.length > 0
      ? await supabase.from("evaluation_cycles").select("id, name_ar").is("deleted_at", null)
      : { data: [] };
  const cycleNameById = new Map(((cyclesData ?? []) as Array<{ id: string; name_ar: string }>).map((c) => [c.id, c.name_ar]));
  const kpiById = new Map(kpis.map((k) => [k.id, k]));

  const targetOptions: InitiativeTargetOption[] = [
    ...kpis.map((k) => ({
      value: `kpi:${k.id}`,
      label: `${k.title_ar} — ${t("planTargetLabel")}: ${k.plan_target_value ?? "—"} ${k.unit_ar}`,
    })),
    ...annualTargetRows.map((a) => {
      const k = kpiById.get(a.kpi_id);
      return {
        value: `annual:${a.id}`,
        label: `${k?.title_ar ?? "—"} — ${cycleNameById.get(a.cycle_id) ?? "—"}: ${a.target_value} ${k?.unit_ar ?? ""}`,
      };
    }),
  ];
  const targetLabelByValue = new Map(targetOptions.map((o) => [o.value, o.label]));

  const { data: initiativeOrgUnits } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("name_ar");
  const orgUnitOptions = ((initiativeOrgUnits ?? []) as Array<{ id: string; name_ar: string }>).map((u) => ({
    id: u.id,
    name: u.name_ar,
  }));
  const orgUnitNameById = new Map(orgUnitOptions.map((u) => [u.id, u.name]));

  // The initiative's own sub-goal ("الهدف الفرعي (LOGIC)" on the real cards),
  // limited to this plan's sub-goals.
  const subGoalOptions = subGoals.map((sg) => ({ id: sg.id, title: sg.title_ar }));
  const subGoalTitleById = new Map(subGoalOptions.map((sg) => [sg.id, sg.title]));
  // The main goal is DERIVED from the sub-goal (the cards present it that way
  // too), so it is never a second stored field to keep in step.
  const mainGoalIdBySubGoal = new Map(subGoals.map((sg) => [sg.id, sg.strategic_goal_id]));
  const goalTitleById = new Map(goals.map((g) => [g.id, g.title_ar]));


  const { data: statusRows } = await supabase
    .from("initiative_statuses")
    .select("code, label_ar")
    .eq("is_active", true)
    .order("display_order");
  const statusOptions: InitiativeStatusOption[] = ((statusRows ?? []) as Array<{ code: string; label_ar: string }>).map((r) => ({
    code: r.code,
    label: r.label_ar,
  }));
  const statusLabelByCode = new Map(statusOptions.map((s) => [s.code, s.label]));

  // Built AFTER the org-unit and sub-goal lookups above: reading them from
  // here while they were still declared below crashed the whole page with a
  // temporal-dead-zone ReferenceError as soon as the plan had one initiative
  // (an empty list never evaluated the map body, which is why it stayed
  // hidden until the first one was added).
  const initiatives: InitiativeView[] = initiativeRows.map((row) => ({
    id: row.id,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    descriptionAr: row.description_ar,
    ownerOrgUnitName: row.owner_org_unit_id ? orgUnitNameById.get(row.owner_org_unit_id) ?? null : null,
    ownerOrgUnitId: row.owner_org_unit_id,
    subGoalTitle: row.sub_goal_id ? subGoalTitleById.get(row.sub_goal_id) ?? null : null,
    mainGoalId: row.sub_goal_id ? mainGoalIdBySubGoal.get(row.sub_goal_id) ?? null : null,
    mainGoalTitle: row.sub_goal_id ? goalTitleById.get(mainGoalIdBySubGoal.get(row.sub_goal_id) ?? "") ?? null : null,
    startDate: row.start_date,
    endDate: row.end_date,
    statusLabel: statusLabelByCode.get(row.status_code) ?? row.status_code,
    statusCode: row.status_code,
    progressPercent: row.progress_percent,
    links: initiativeLinkRows
      .filter((l) => l.initiative_id === row.id)
      .map((l) => ({
        id: l.id,
        label:
          targetLabelByValue.get(l.kpi_id ? `kpi:${l.kpi_id}` : `annual:${l.kpi_annual_target_id}`) ??
          t("unknownTarget"),
      })),
  }));

  const initiativesContent = (
    <div>
      <InitiativesPanel
        toolbar={<StrategicPlanExcelButtons planId={plan.id} canImport={canManageGoals} />}
        planId={plan.id}
        initiatives={initiatives}
        targetOptions={targetOptions}
        orgUnitOptions={orgUnitOptions}
        subGoalOptions={subGoalOptions}
        statusOptions={statusOptions}
        canManage={canManageGoals}
      />
    </div>
  );

  // ---- برامج الاستراتيجية: programs grouping this plan's initiatives ----
  // A committee member with no strategicPlanning grant still sees their own
  // programs here — strategic_programs_select lets membership alone grant
  // read (20260819000002), which is the "لكل عضو في اللجنة أكسس" ask.
  const { data: programRows } = await supabase
    .from("strategic_programs")
    .select("id, name_ar, name_en, description_ar, status, start_date, end_date")
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const programList = (programRows ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    description_ar: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
  }>;

  const { data: programInitiativeCounts } = await supabase
    .from("strategic_program_initiatives")
    .select("program_id")
    .is("deleted_at", null);
  const { data: programCommitteeCounts } = await supabase
    .from("strategic_program_committee_members")
    .select("program_id")
    .is("deleted_at", null);
  function countFor(rows: Array<{ program_id: string }> | null, programId: string): number {
    return (rows ?? []).filter((r) => r.program_id === programId).length;
  }

  const programs: ProgramSummary[] = programList.map((p) => ({
    id: p.id,
    nameAr: p.name_ar,
    nameEn: p.name_en,
    descriptionAr: p.description_ar,
    status: p.status,
    startDate: p.start_date,
    endDate: p.end_date,
    initiativeCount: countFor(programInitiativeCounts as Array<{ program_id: string }> | null, p.id),
    committeeCount: countFor(programCommitteeCounts as Array<{ program_id: string }> | null, p.id),
  }));

  const programsContent = (
    <ProgramsPanel
      planId={plan.id}
      programs={programs}
      locale={locale}
      canManage={canManageGoals}
      toolbar={<StrategicPlanExcelButtons planId={plan.id} canImport={canManageGoals} />}
    />
  );

  // Order requested directly (2026-08-01): vision/mission first (the
  // foundation), then strategic goals (main + sub-goals + KPIs), then --
  // added 2026-08-19 -- the initiatives that achieve those targets, then
  // assigned goals (deferred follow-up work per the same request), then the
  // goal library last.
  const tabs: ProfileTab[] = [
    { id: "identity", label: tIdentity("title"), content: identityContent },
    { id: "goals", label: tGoals("title"), content: goalsContent },
    { id: "initiatives", label: t("initiativesTab"), content: initiativesContent },
    { id: "programs", label: t("programsTab"), content: programsContent },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href="/kpis/plans"
        className="sru-btn no-print"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backToList")}
      </Link>
      {/* The export/import tools used to float up here beside the plan's
          title in their own style. They now live in each tab's action row
          next to that tab's primary action, all one shape (2026-08-20
          request). Import still shows only at 'approve' — the level the
          goals/sub-goals/KPIs/annual-targets policies actually require;
          the identity/values sheets sit lower at 'prepare', so a
          prepare-level caller keeps editing those through the tab itself. */}
      <div
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}
      >
        {/* The icon sits beside the whole stack, so the Arabic name and the
            lines under it share one starting edge. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Flag size={20} aria-hidden style={{ color: "var(--sru-purple)", marginTop: 6, flex: "0 0 auto" }} />
          <div style={{ minWidth: 0 }}>
            <h1 className="sru-title" style={{ fontSize: 20 }}>
              {plan.name_ar}
            </h1>
            {plan.name_en && <p className="sru-name-en is-lg">{plan.name_en}</p>}
            <p className="sru-name-en">
              {plan.start_year}–{plan.end_year}
            </p>
          </div>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
