import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, CalendarRange } from "lucide-react";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { ExecutivePlanTargetsPanel, type PlanKpiRow } from "@/components/ExecutivePlanTargetsPanel";
import {
  TargetEmployeeAssignmentPanel,
  type UnitShareRow,
  type EmployeeOption,
} from "@/components/TargetEmployeeAssignmentPanel";
import { PlanActivitiesPanel, type PlanActivityRow } from "@/components/PlanActivitiesPanel";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { splitByWindow } from "@/lib/executivePlanScope";
import { formatDateDmy } from "@/lib/dateParts";
import type { Locale } from "@/i18n/config";

/**
 * One executive plan: the strategic plan's targets and initiatives, narrowed
 * to this plan's own window ("لا يظهر الا المبادرات المحددة في نفس توقيت
 * الخطة التشغيلية").
 *
 * Nothing is duplicated into the executive plan — both tabs read the
 * strategic plan's own rows and filter them, so an initiative edited in the
 * strategic module is immediately correct here. The filtering rule itself
 * lives in lib/executivePlanScope.ts with its tests, not inline.
 *
 * Items with no dates are shown in their own group rather than dropped: on
 * the real initiative cards most dates still read "TBD", and silently hiding
 * them would make them look deleted.
 */
export default async function ExecutivePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: Locale }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations("ExecutivePlanDetailPage");
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("executive_plans")
    .select("id, strategic_plan_id, cycle_id, name_ar, name_en, start_date, end_date, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!plan) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <Link
          href="/executive-plans"
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

  const window = { startDate: plan.start_date as string, endDate: plan.end_date as string };

  const { data: strategicPlan } = await supabase
    .from("strategic_plans")
    .select("name_ar")
    .eq("id", plan.strategic_plan_id)
    .maybeSingle();

  // ---- المستهدفات: the strategic plan's annual targets, by cycle ----
  const { data: goalRows } = await supabase
    .from("strategic_goals")
    .select("id, title_ar")
    .eq("plan_id", plan.strategic_plan_id)
    .is("deleted_at", null);
  const goalIds = new Set(((goalRows ?? []) as Array<{ id: string }>).map((g) => g.id));
  const goalTitleById = new Map(((goalRows ?? []) as Array<{ id: string; title_ar: string }>).map((g) => [g.id, g.title_ar]));

  const { data: subGoalRows } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, title_ar")
    .is("deleted_at", null);
  const planSubGoals = ((subGoalRows ?? []) as Array<{ id: string; strategic_goal_id: string; title_ar: string }>).filter((sg) =>
    goalIds.has(sg.strategic_goal_id)
  );
  const subGoalIds = new Set(planSubGoals.map((sg) => sg.id));
  const subGoalTitleById = new Map(planSubGoals.map((sg) => [sg.id, sg.title_ar]));

  const { data: kpiRows } = await supabase
    .from("strategic_kpis")
    .select("id, strategic_goal_id, sub_goal_id, title_ar, title_en, unit_ar, plan_target_value")
    .is("deleted_at", null);
  const planKpis = ((kpiRows ?? []) as Array<{
    id: string;
    strategic_goal_id: string | null;
    sub_goal_id: string | null;
    title_ar: string;
    title_en: string | null;
    unit_ar: string;
    plan_target_value: number | null;
  }>).filter((k) => (k.strategic_goal_id && goalIds.has(k.strategic_goal_id)) || (k.sub_goal_id && subGoalIds.has(k.sub_goal_id)));

  const { data: cycleRows } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null);
  const cycles = (cycleRows ?? []) as Array<{ id: string; name_ar: string; start_date: string | null; end_date: string | null }>;
  const cycleNameById = new Map(cycles.map((c) => [c.id, c.name_ar]));

  // ---- اختيار مستهدفات العام وإسقاطها على الجهات (2026-08-23) ----
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const strategicLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canManageTargets = hasVpraAccess(strategicLevel, "approve");

  const { data: selectedRows } = await supabase
    .from("executive_plan_targets")
    .select("id, strategic_kpi_id, target_value, actual_value")
    .eq("executive_plan_id", id)
    .is("deleted_at", null);
  const selectedTargets = (selectedRows ?? []) as Array<{
    id: string;
    strategic_kpi_id: string;
    target_value: number | string | null;
    actual_value: number | string | null;
  }>;

  const { data: shareRows } =
    selectedTargets.length > 0
      ? await supabase
          .from("executive_plan_target_org_units")
          .select("id, executive_plan_target_id, org_unit_id, percentage, actual_value")
          .in(
            "executive_plan_target_id",
            selectedTargets.map((r) => r.id)
          )
          .is("deleted_at", null)
      : { data: [] };
  const shares = (shareRows ?? []) as Array<{
    id: string;
    executive_plan_target_id: string;
    org_unit_id: string;
    percentage: number | string;
    actual_value: number | string | null;
  }>;

  // Every org unit, for the split's picker — read through the caller's own
  // client, so the options are exactly what they may actually assign to.
  const { data: allUnitRows } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("name_ar");
  const assignableUnits = ((allUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => ({
    id: u.id,
    nameAr: u.name_ar,
  }));
  const unitNameById = new Map(assignableUnits.map((u) => [u.id, u.nameAr]));

  const targetRows: PlanKpiRow[] = planKpis.map((k) => {
    const chosen = selectedTargets.find((sel) => sel.strategic_kpi_id === k.id) ?? null;
    return {
      id: k.id,
      titleAr: k.title_ar,
      titleEn: k.title_en,
      unitAr: k.unit_ar,
      planTargetValue: k.plan_target_value,
      goalTitle: k.strategic_goal_id ? goalTitleById.get(k.strategic_goal_id) ?? null : null,
      subGoalTitle: k.sub_goal_id ? subGoalTitleById.get(k.sub_goal_id) ?? null : null,
      selected: chosen
        ? {
            id: chosen.id,
            targetValue: chosen.target_value,
            actualValue: chosen.actual_value,
            orgUnits: shares
              .filter((sh) => sh.executive_plan_target_id === chosen.id)
              .map((sh) => ({
                orgUnitId: sh.org_unit_id,
                orgUnitName: unitNameById.get(sh.org_unit_id) ?? "—",
                percentage: Number(sh.percentage),
              })),
          }
        : null,
    };
  });

  // ---- إسناد الموظفين: each unit's split of its own share (2026-08-23) ----
  const { data: employeeShareRows } =
    shares.length > 0
      ? await supabase
          .from("executive_plan_target_employees")
          .select("id, target_org_unit_id, employee_id, percentage, actual_value, actual_recorded_by")
          .in(
            "target_org_unit_id",
            shares.map((sh) => sh.id)
          )
          .is("deleted_at", null)
      : { data: [] };
  const employeeShares = (employeeShareRows ?? []) as Array<{
    id: string;
    target_org_unit_id: string;
    employee_id: string;
    percentage: number | string;
    actual_value: number | string | null;
    actual_recorded_by: string | null;
  }>;

  // Employees the caller can actually see — profiles_select's own RLS decides,
  // so a manager scoped to one unit gets that unit's staff and no one else's.
  const { data: employeeRows } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, org_unit_id")
    .is("deleted_at", null)
    .order("employee_number");
  const employeeOptions: EmployeeOption[] = ((employeeRows ?? []) as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    org_unit_id: string | null;
  }>).map((e) => ({ id: e.id, label: e.employee_number + " — " + e.full_name_ar, orgUnitId: e.org_unit_id }));
  const employeeNameById = new Map(employeeOptions.map((e) => [e.id, e.label]));

  // Which units this caller may write inside. 'approve' writes anywhere;
  // otherwise it is the scoped grant, so the units their own role covers.
  // Postgres decides for real — this only chooses what to render as editable.
  const { data: myScopedUnits } = hasVpraAccess(strategicLevel, "prepare")
    ? await supabase.rpc("my_scoped_org_unit_ids", { p_process_area: "strategicPlanning", p_level: "prepare" })
    : { data: [] };
  const scopedUnitIds = new Set(((myScopedUnits ?? []) as Array<{ org_unit_id: string }>).map((r) => r.org_unit_id));

  const kpiInfoById = new Map(planKpis.map((k) => [k.id, { title: k.title_ar, unit: k.unit_ar }]));
  const yearValueByTargetId = new Map(selectedTargets.map((sel) => [sel.id, sel.target_value]));

  const unitShares: UnitShareRow[] = shares.map((sh) => {
    const chosen = selectedTargets.find((sel) => sel.id === sh.executive_plan_target_id);
    const kpi = chosen ? kpiInfoById.get(chosen.strategic_kpi_id) : undefined;
    const yearValue = yearValueByTargetId.get(sh.executive_plan_target_id);
    return {
      shareId: sh.id,
      targetTitle: kpi?.title ?? "—",
      targetUnit: kpi?.unit ?? "",
      yearTargetValue: yearValue == null ? null : Number(yearValue),
      orgUnitId: sh.org_unit_id,
      orgUnitName: unitNameById.get(sh.org_unit_id) ?? "—",
      percentage: Number(sh.percentage),
      actualValue: sh.actual_value,
      employees: employeeShares
        .filter((es) => es.target_org_unit_id === sh.id)
        .map((es) => ({
          assignmentId: es.id,
          employeeId: es.employee_id,
          employeeName: employeeNameById.get(es.employee_id) ?? "—",
          percentage: Number(es.percentage),
          actualValue: es.actual_value,
          actualRecordedBy: es.actual_recorded_by ? employeeNameById.get(es.actual_recorded_by) ?? null : null,
          actualSelfReported: es.actual_recorded_by != null && es.actual_recorded_by === es.employee_id,
        })),
      canManage: canManageTargets || scopedUnitIds.has(sh.org_unit_id),
    };
  });

  // ---- المبادرات: the strategic plan's initiatives, by their own period ----
  const { data: initiativeRows } = await supabase
    .from("strategic_initiatives")
    .select("id, title_ar, code, owner_org_unit_id, status_code, start_date, end_date")
    .eq("plan_id", plan.strategic_plan_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const initiatives = ((initiativeRows ?? []) as Array<{
    id: string;
    title_ar: string;
    code: string | null;
    owner_org_unit_id: string | null;
    status_code: string;
    start_date: string | null;
    end_date: string | null;
  }>).map((i) => ({ ...i, startDate: i.start_date, endDate: i.end_date }));

  const scoped = splitByWindow(initiatives, window);

  const orgUnitIds = Array.from(new Set(initiatives.map((i) => i.owner_org_unit_id).filter((v): v is string => Boolean(v))));
  const { data: orgUnitRows } =
    orgUnitIds.length > 0 ? await supabase.from("org_units").select("id, name_ar").in("id", orgUnitIds) : { data: [] };
  const orgUnitNameById = new Map(((orgUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => [u.id, u.name_ar]));

  const { data: statusRows } = await supabase.from("initiative_statuses").select("code, label_ar");
  const statusLabelByCode = new Map(((statusRows ?? []) as Array<{ code: string; label_ar: string }>).map((s) => [s.code, s.label_ar]));

  const targetsContent = (
    <ExecutivePlanTargetsPanel
      executivePlanId={id}
      kpis={targetRows}
      orgUnits={assignableUnits}
      canManage={canManageTargets}
    />
  );

  const initiativeTable = (rows: typeof scoped.inWindow) => (
    <div className="sru-card" style={{ marginBottom: 12 }}>
      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              <th>{t("columnCode")}</th>
              <th>{t("columnInitiative")}</th>
              <th>{t("columnOwner")}</th>
              <th>{t("columnStatus")}</th>
              <th>{t("columnPeriod")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((initiative) => (
              <tr key={initiative.id}>
                <td dir="ltr" style={{ textAlign: "start" }}>
                  {initiative.code ?? "—"}
                </td>
                <td>
                  <Link
                    href={`/initiatives/${initiative.id}`}
                    style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}
                  >
                    {initiative.title_ar}
                  </Link>
                </td>
                <td>{initiative.owner_org_unit_id ? orgUnitNameById.get(initiative.owner_org_unit_id) ?? "—" : "—"}</td>
                <td>{statusLabelByCode.get(initiative.status_code) ?? initiative.status_code}</td>
                <td dir="ltr" style={{ textAlign: "start" }}>
                  {initiative.startDate || initiative.endDate
                    ? `${initiative.startDate ?? "—"} → ${initiative.endDate ?? "—"}`
                    : t("noDates")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const initiativesContent = (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>{t("initiativesIntro")}</p>

      {scoped.inWindow.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 12 }}>{t("initiativesNoneInWindow")}</p>
      ) : (
        initiativeTable(scoped.inWindow)
      )}

      {scoped.undated.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t("undatedHeading", { count: scoped.undated.length })}</h3>
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 8 }}>{t("undatedNote")}</p>
          {initiativeTable(scoped.undated)}
        </section>
      )}

      {scoped.outside.length > 0 && (
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 10 }}>
          {t("outsideNote", { count: scoped.outside.length })}
        </p>
      )}
    </div>
  );

  // ---- جميع الأنشطة (2026-08-23) ----
  const initiativeIds = initiatives.map((i) => i.id);
  const { data: activityRows } =
    initiativeIds.length > 0
      ? await supabase
          .from("initiative_activities")
          .select("id, initiative_id, title_ar, responsible_profile_id, responsible_name, start_date, end_date, display_order")
          .in("initiative_id", initiativeIds)
          .is("deleted_at", null)
          .order("display_order", { ascending: true })
      : { data: [] };
  const activityList = (activityRows ?? []) as Array<{
    id: string;
    initiative_id: string;
    title_ar: string;
    responsible_profile_id: string | null;
    responsible_name: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;

  // A unit carries an activity if it owns the initiative or is assigned to
  // it — an initiative can be shared, so this is a list, not one unit.
  const { data: assignmentRows } =
    initiativeIds.length > 0
      ? await supabase
          .from("initiative_assignments")
          .select("initiative_id, org_unit_id")
          .in("initiative_id", initiativeIds)
          .is("deleted_at", null)
      : { data: [] };
  const assignments = (assignmentRows ?? []) as Array<{ initiative_id: string; org_unit_id: string }>;

  const activityUnitIds = new Set<string>();
  for (const a of assignments) activityUnitIds.add(a.org_unit_id);
  for (const i of initiatives) if (i.owner_org_unit_id) activityUnitIds.add(i.owner_org_unit_id);
  const { data: activityUnitRows } =
    activityUnitIds.size > 0
      ? await supabase.from("org_units").select("id, name_ar").in("id", [...activityUnitIds])
      : { data: [] };
  const activityUnitNameById = new Map(
    ((activityUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => [u.id, u.name_ar])
  );

  const responsibleIds = Array.from(
    new Set(activityList.map((a) => a.responsible_profile_id).filter((v): v is string => Boolean(v)))
  );
  const { data: responsibleRows } =
    responsibleIds.length > 0
      ? await supabase.from("profiles").select("id, full_name_ar").in("id", responsibleIds)
      : { data: [] };
  const responsibleNameById = new Map(
    ((responsibleRows ?? []) as Array<{ id: string; full_name_ar: string }>).map((p) => [p.id, p.full_name_ar])
  );

  const initiativeById = new Map(initiatives.map((i) => [i.id, i]));
  const planActivities: PlanActivityRow[] = activityList.map((a) => {
    const initiative = initiativeById.get(a.initiative_id);
    const unitIds = Array.from(
      new Set([
        ...(initiative?.owner_org_unit_id ? [initiative.owner_org_unit_id] : []),
        ...assignments.filter((as) => as.initiative_id === a.initiative_id).map((as) => as.org_unit_id),
      ])
    );
    return {
      id: a.id,
      titleAr: a.title_ar,
      responsible: a.responsible_profile_id
        ? responsibleNameById.get(a.responsible_profile_id) ?? null
        : a.responsible_name,
      startDate: a.start_date,
      endDate: a.end_date,
      initiativeId: a.initiative_id,
      initiativeTitle: initiative?.title_ar ?? "—",
      orgUnitIds: unitIds,
      orgUnitNames: unitIds.map((id) => activityUnitNameById.get(id)).filter((v): v is string => Boolean(v)),
    };
  });

  const activityUnitOptions = [...activityUnitIds]
    .map((id) => ({ id, label: activityUnitNameById.get(id) ?? "—" }))
    .filter((u) => u.label !== "—")
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  const activityInitiativeOptions = initiatives
    .filter((i) => activityList.some((a) => a.initiative_id === i.id))
    .map((i) => ({ id: i.id, label: i.title_ar }));

  const tabs: ProfileTab[] = [
    { id: "targets", label: t("targetsTab"), content: targetsContent },
    {
      id: "employees",
      label: t("employeesTab"),
      content: <TargetEmployeeAssignmentPanel shares={unitShares} employees={employeeOptions} />,
    },
    { id: "initiatives", label: t("initiativesTab"), content: initiativesContent },
    {
      id: "activities",
      label: t("activitiesTab"),
      content: (
        <PlanActivitiesPanel
          activities={planActivities}
          orgUnits={activityUnitOptions}
          initiatives={activityInitiativeOptions}
          locale={locale}
        />
      ),
    },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href="/executive-plans"
        className="sru-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backToList")}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <CalendarRange size={20} aria-hidden style={{ color: "var(--sru-purple)" }} />
        <h1 className="sru-title" style={{ fontSize: 20 }}>
          {plan.name_ar}
        </h1>
      </div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
        {t("windowLabel", {
          from: formatDateDmy(plan.start_date as string, locale),
          to: formatDateDmy(plan.end_date as string, locale),
        })}
        {" · "}
        {t("strategicPlanLabel", { plan: strategicPlan?.name_ar ?? "—" })}
        {plan.cycle_id ? ` · ${t("cycleLabel", { cycle: cycleNameById.get(plan.cycle_id as string) ?? "—" })}` : ""}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
