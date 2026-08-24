import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import {
  InitiativeAssignmentsPanel,
  type AssignableInitiative,
  type AssignmentRole,
} from "@/components/InitiativeAssignmentsPanel";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

/**
 * إسناد المبادرات — the merged tab requested 2026-08-19 ("ادمج بنك الأهداف مع
 * الأهداف المسندة بحيث يكون العنوان اسناد المبادرات ومعها المستهدفات").
 *
 * It lists EVERY initiative of the strategic plans, assigned and unassigned
 * alike, each shown with the targets it serves — the plan target (from the
 * strategic-goals tab) and the annual target — so the assignment decision is
 * made with its context on screen.
 *
 * Reading is open to whoever can read the initiatives themselves (their own
 * RLS decides: the module grant, the owning position, or program-committee
 * membership). Assigning requires strategicPlanning='approve', matching
 * initiative_assignments' own policies.
 */
export default async function InitiativeAssignmentsPage() {
  const t = await getTranslations("InitiativeAssignmentsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canAssign = hasVpraAccess(level, "approve");

  const { data: initiativeRows } = await supabase
    .from("strategic_initiatives")
    .select("id, plan_id, title_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const initiatives = (initiativeRows ?? []) as Array<{
    id: string;
    plan_id: string;
    title_ar: string;
    start_date: string | null;
    end_date: string | null;
  }>;

  const { data: plansData } = await supabase.from("strategic_plans").select("id, name_ar").is("deleted_at", null);
  const planNameById = new Map(((plansData ?? []) as Array<{ id: string; name_ar: string }>).map((p) => [p.id, p.name_ar]));

  // ---- targets each initiative serves (plan target + annual target) ----
  const { data: linkRows } = await supabase
    .from("strategic_initiative_targets")
    .select("initiative_id, kpi_id, kpi_annual_target_id")
    .is("deleted_at", null);
  const { data: kpiRows } = await supabase
    .from("strategic_kpis")
    .select("id, title_ar, unit_ar, plan_target_value")
    .is("deleted_at", null);
  const kpiById = new Map(
    ((kpiRows ?? []) as Array<{ id: string; title_ar: string; unit_ar: string; plan_target_value: number | null }>).map((k) => [k.id, k])
  );
  const { data: annualRows } = await supabase
    .from("kpi_annual_targets")
    .select("id, kpi_id, target_value, cycle_id")
    .is("deleted_at", null);
  const annualById = new Map(
    ((annualRows ?? []) as Array<{ id: string; kpi_id: string; target_value: number; cycle_id: string }>).map((a) => [a.id, a])
  );
  const { data: cycleRows } = await supabase.from("evaluation_cycles").select("id, name_ar").is("deleted_at", null);
  const cycleNameById = new Map(((cycleRows ?? []) as Array<{ id: string; name_ar: string }>).map((c) => [c.id, c.name_ar]));

  // ---- existing assignments ----
  const { data: assignmentRows } = await supabase
    .from("initiative_assignments")
    .select("initiative_id, org_unit_id, role, percentage")
    .is("deleted_at", null);
  const assignments = (assignmentRows ?? []) as Array<{
    initiative_id: string;
    org_unit_id: string;
    role: AssignmentRole;
    percentage: number | null;
  }>;

  const { data: orgUnitRows } = await supabase.from("org_units").select("id, name_ar").is("deleted_at", null).order("name_ar");
  const orgUnits = ((orgUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => ({ id: u.id, name: u.name_ar }));
  const orgUnitNameById = new Map(orgUnits.map((u) => [u.id, u.name]));

  const view: AssignableInitiative[] = initiatives.map((initiative) => {
    const links = (linkRows ?? []).filter((l) => l.initiative_id === initiative.id);
    const planTargets: string[] = [];
    const annualTargets: string[] = [];
    for (const link of links) {
      if (link.kpi_id) {
        const k = kpiById.get(link.kpi_id as string);
        if (k) planTargets.push(`${k.title_ar} (${k.plan_target_value ?? "—"} ${k.unit_ar})`);
      } else if (link.kpi_annual_target_id) {
        const a = annualById.get(link.kpi_annual_target_id as string);
        const k = a ? kpiById.get(a.kpi_id) : undefined;
        if (a && k) {
          annualTargets.push(`${k.title_ar} — ${cycleNameById.get(a.cycle_id) ?? "—"}: ${a.target_value} ${k.unit_ar}`);
        }
      }
    }
    return {
      id: initiative.id,
      titleAr: initiative.title_ar,
      planName: planNameById.get(initiative.plan_id) ?? "—",
      planTargets,
      annualTargets,
      startDate: initiative.start_date,
      endDate: initiative.end_date,
      assignments: assignments
        .filter((a) => a.initiative_id === initiative.id)
        .map((a) => ({
          orgUnitId: a.org_unit_id,
          // A caller without org-unit visibility still sees the assignment
          // itself; only the name falls back.
          orgUnitName: orgUnitNameById.get(a.org_unit_id) ?? "—",
          role: a.role,
          percentage: a.percentage,
        }))
        // Lead first, then participants, then supporters — the order the
        // cards read in.
        .sort((x, y) => {
          const rank = { lead: 0, participant: 1, supporter: 2 } as const;
          return rank[x.role] - rank[y.role];
        }),
    };
  });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="executivePlan" current="initiative-assignments" />

      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {view.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noInitiatives")}</p>
      ) : (
        <InitiativeAssignmentsPanel initiatives={view} orgUnits={orgUnits} canAssign={canAssign} />
      )}
    </div>
  );
}
