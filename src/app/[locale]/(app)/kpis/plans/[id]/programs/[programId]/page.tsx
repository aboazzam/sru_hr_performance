import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Boxes } from "lucide-react";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { ProgramCommitteeManager, type CommitteeMemberView } from "@/components/ProgramCommitteeManager";
import { ProgramInitiativesTab, type ProgramInitiativeRow } from "@/components/ProgramInitiativesTab";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

/**
 * One program, with the three sub-tabs requested 2026-08-19: "سبتاب للجنة
 * المشرفة على البرنامج وسبتاب لداشبورد عن البرنامج وسبتاب عن تفصيل البرنامج
 * والمبادرات المدرجة تحته".
 *
 * Reachable by anyone `strategic_programs_select` lets in — either the
 * module-wide strategicPlanning>='view' grant, or committee membership
 * alone, which is the explicit "لكل عضو في اللجنة أكسس" requirement. Nothing
 * here re-implements that check: an unauthorized caller simply gets no row
 * back and sees the not-found message.
 *
 * The dashboard is deliberately built ONLY from data that already exists —
 * counts of initiatives, how many are linked to a target, and the mix of
 * statuses. No completion percentage is invented: initiatives carry no
 * progress column, and the department-level "كيف عمل الإدارات تجاه هذه
 * المبادرات" view needs the initiative-assignment slice that has not been
 * built yet. That gap is stated in the UI rather than filled with a
 * fabricated number.
 */
export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string; programId: string }>;
}) {
  const { id, programId } = await params;
  const t = await getTranslations("ProgramDetailPage");
  const tCommittee = await getTranslations("ProgramCommittee");
  const tInitiatives = await getTranslations("ProgramInitiativesTab");
  const tDashboard = await getTranslations("ProgramDashboard");
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("strategic_programs")
    .select("id, plan_id, name_ar, name_en, description_ar, status, start_date, end_date")
    .eq("id", programId)
    .eq("plan_id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!program) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <Link
          href={`/kpis/plans/${id}`}
          className="sru-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
        >
          <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
          {t("backToPlan")}
        </Link>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canManage = hasVpraAccess(permissions.strategicPlanning ?? "none", "approve");

  // ---- committee ----
  const { data: memberRows } = await supabase
    .from("strategic_program_committee_members")
    .select("id, member_profile_id, committee_role, external_name, external_org, external_email, display_order")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  const memberProfileIds = (memberRows ?? [])
    .map((m) => m.member_profile_id as string | null)
    .filter((v): v is string => v !== null);

  const { data: memberProfiles } =
    memberProfileIds.length > 0
      ? await supabase.from("profiles").select("id, employee_number, full_name_ar").in("id", memberProfileIds)
      : { data: [] };
  const profileById = new Map(
    ((memberProfiles ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map((p) => [p.id, p])
  );
  const members: CommitteeMemberView[] = (memberRows ?? []).map((m) => {
    const externalName = (m.external_name as string | null) ?? null;
    if (externalName) {
      return {
        rowId: m.id as string,
        name: externalName,
        subtitle: ((m.external_org as string | null) ?? (m.external_email as string | null)) ?? tCommittee("externalNoOrg"),
        committeeRole: (m.committee_role as string | null) ?? null,
        isExternal: true,
      };
    }
    const profile = profileById.get(m.member_profile_id as string);
    return {
      rowId: m.id as string,
      // A committee member without employeeData access cannot read their
      // colleagues' profile rows, so the name may legitimately be missing —
      // shown as a placeholder rather than an empty cell.
      name: profile?.full_name_ar ?? tCommittee("unknownMember"),
      subtitle: profile?.employee_number ?? "—",
      committeeRole: (m.committee_role as string | null) ?? null,
      isExternal: false,
    };
  });

  // ---- initiatives under this program ----
  const { data: programInitiativeRows } = await supabase
    .from("strategic_program_initiatives")
    .select("id, initiative_id")
    .eq("program_id", programId)
    .is("deleted_at", null);
  const linkedInitiativeIds = (programInitiativeRows ?? []).map((r) => r.initiative_id as string);

  const { data: planInitiatives } = await supabase
    .from("strategic_initiatives")
    .select("id, title_ar, code, deliverable_ar, sub_goal_id, owner_org_unit_id, horizon, status_code, start_date, end_date")
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const planInitiativeRows = (planInitiatives ?? []) as Array<{
    id: string;
    title_ar: string;
    code: string | null;
    deliverable_ar: string | null;
    sub_goal_id: string | null;
    owner_org_unit_id: string | null;
    horizon: string | null;
    status_code: string;
    start_date: string | null;
    end_date: string | null;
  }>;
  const initiativeById = new Map(planInitiativeRows.map((i) => [i.id, i]));

  // Lookups the card view needs: owning department, sub-goal (and the
  // strategic goal it rolls up to), and the admin-managed status labels.
  const { data: orgUnitRows } = await supabase.from("org_units").select("id, name_ar").is("deleted_at", null).order("name_ar");
  const orgUnitOptions = ((orgUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => ({ id: u.id, name: u.name_ar }));
  const orgUnitNameById = new Map(orgUnitOptions.map((u) => [u.id, u.name]));

  const { data: subGoalRows } = await supabase
    .from("sub_goals")
    .select("id, title_ar, strategic_goal_id")
    .is("deleted_at", null)
    .order("created_at");
  const { data: goalRows } = await supabase
    .from("strategic_goals")
    .select("id, title_ar")
    .eq("plan_id", id)
    .is("deleted_at", null);
  const goalTitleById = new Map(((goalRows ?? []) as Array<{ id: string; title_ar: string }>).map((g) => [g.id, g.title_ar]));
  const planSubGoals = ((subGoalRows ?? []) as Array<{ id: string; title_ar: string; strategic_goal_id: string }>).filter((sg) =>
    goalTitleById.has(sg.strategic_goal_id)
  );
  const subGoalOptions = planSubGoals.map((sg) => ({ id: sg.id, title: sg.title_ar }));
  const subGoalById = new Map(planSubGoals.map((sg) => [sg.id, sg]));

  const { data: statusRows } = await supabase
    .from("initiative_statuses")
    .select("code, label_ar")
    .eq("is_active", true)
    .order("display_order");
  const statusOptions = ((statusRows ?? []) as Array<{ code: string; label_ar: string }>).map((r) => ({ code: r.code, label: r.label_ar }));
  const statusLabelByCode = new Map(statusOptions.map((s) => [s.code, s.label]));

  const { data: initiativeTargetRows } = await supabase
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
    .select("id, kpi_id, target_value")
    .is("deleted_at", null);
  const annualById = new Map(
    ((annualRows ?? []) as Array<{ id: string; kpi_id: string; target_value: number }>).map((a) => [a.id, a])
  );

  function targetLabelsFor(initiativeId: string): string[] {
    return ((initiativeTargetRows ?? []) as Array<{ initiative_id: string; kpi_id: string | null; kpi_annual_target_id: string | null }>)
      .filter((l) => l.initiative_id === initiativeId)
      .map((l) => {
        if (l.kpi_id) {
          const k = kpiById.get(l.kpi_id);
          return k ? `${k.title_ar} (${k.plan_target_value ?? "—"} ${k.unit_ar})` : tInitiatives("unknownTarget");
        }
        const a = l.kpi_annual_target_id ? annualById.get(l.kpi_annual_target_id) : undefined;
        const k = a ? kpiById.get(a.kpi_id) : undefined;
        return a && k ? `${k.title_ar} (${a.target_value} ${k.unit_ar})` : tInitiatives("unknownTarget");
      });
  }

  const programInitiatives: ProgramInitiativeRow[] = (programInitiativeRows ?? [])
    .map((row) => {
      const initiative = initiativeById.get(row.initiative_id as string);
      if (!initiative) return null;
      const sub = initiative.sub_goal_id ? subGoalById.get(initiative.sub_goal_id) : undefined;
      return {
        rowId: row.id as string,
        initiativeId: initiative.id,
        code: initiative.code,
        titleAr: initiative.title_ar,
        deliverableAr: initiative.deliverable_ar,
        subGoalTitle: sub?.title_ar ?? null,
        strategicGoalTitle: sub ? goalTitleById.get(sub.strategic_goal_id) ?? null : null,
        ownerOrgUnitName: initiative.owner_org_unit_id ? orgUnitNameById.get(initiative.owner_org_unit_id) ?? null : null,
        horizon: initiative.horizon,
        statusLabel: statusLabelByCode.get(initiative.status_code) ?? initiative.status_code,
        startDate: initiative.start_date,
        endDate: initiative.end_date,
      };
    })
    .filter((v): v is ProgramInitiativeRow => v !== null);

  // Deliberately NOT filtered by goal: a program pulls related initiatives
  // from different goals together, which is its whole purpose.
  const availableInitiatives = planInitiativeRows
    .filter((i) => !linkedInitiativeIds.includes(i.id))
    .map((i) => ({
      id: i.id,
      titleAr: i.title_ar,
      subGoalTitle: i.sub_goal_id ? subGoalById.get(i.sub_goal_id)?.title_ar ?? null : null,
    }));

  // Employee options for adding committee members: RLS-scoped, so a caller
  // without employeeData access simply gets a short list (or only
  // themselves) — the same documented limitation as every other people
  // picker in this app.
  const { data: employees } = canManage
    ? await supabase
        .from("profiles")
        .select("id, employee_number, full_name_ar")
        .is("deleted_at", null)
        .order("employee_number")
    : { data: [] };
  const employeeOptions = ((employees ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map((e) => ({
    id: e.id,
    label: `${e.employee_number} — ${e.full_name_ar}`,
  }));

  // ---- dashboard: only real, already-stored facts ----
  const withTarget = programInitiatives.filter((i) => targetLabelsFor(i.initiativeId).length > 0).length;
  const statusCounts = new Map<string, number>();
  for (const i of programInitiatives) statusCounts.set(i.statusLabel, (statusCounts.get(i.statusLabel) ?? 0) + 1);

  const dashboardContent = (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label={tDashboard("initiativesCount")} value={String(programInitiatives.length)} />
        <StatCard label={tDashboard("linkedToTargets")} value={`${withTarget} / ${programInitiatives.length}`} />
        <StatCard label={tDashboard("committeeCount")} value={String(members.length)} />
        <StatCard
          label={tDashboard("period")}
          value={program.start_date || program.end_date ? `${program.start_date ?? "—"} → ${program.end_date ?? "—"}` : "—"}
        />
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{tDashboard("byStatus")}</h3>
      {statusCounts.size === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tDashboard("noInitiatives")}</p>
      ) : (
        <ul style={{ margin: 0, paddingInlineStart: 0, listStyle: "none", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from(statusCounts.entries()).map(([status, count]) => (
            <li key={status} className="pill">
              {status}: {count}
            </li>
          ))}
        </ul>
      )}

      <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8, marginTop: 20 }}>{tDashboard("progressNote")}</p>
    </div>
  );

  const tabs: ProfileTab[] = [
    {
      id: "committee",
      label: tCommittee("title"),
      content: (
        <ProgramCommitteeManager programId={program.id} members={members} employeeOptions={employeeOptions} canManage={canManage} />
      ),
    },
    { id: "dashboard", label: tDashboard("title"), content: dashboardContent },
    {
      id: "initiatives",
      label: tInitiatives("title"),
      content: (
        <ProgramInitiativesTab
          programId={program.id}
          planId={id}
          rows={programInitiatives}
          availableInitiatives={availableInitiatives}
          orgUnitOptions={orgUnitOptions}
          subGoalOptions={subGoalOptions}
          statusOptions={statusOptions}
          canManage={canManage}
        />
      ),
    },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href={`/kpis/plans/${id}`}
        className="sru-btn no-print"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backToPlan")}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Boxes size={20} aria-hidden style={{ color: "var(--sru-purple)" }} />
        <h1 className="sru-title" style={{ fontSize: 24 }}>
          {program.name_ar}
        </h1>
      </div>
      {program.name_en && (
        <p dir="ltr" style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 2 }}>
          {program.name_en}
        </p>
      )}
      {program.description_ar && <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.8 }}>{program.description_ar}</p>}
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("statusValue", { status: program.status })}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="sru-card" style={{ padding: 14 }}>
      <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 12 }}>{label}</span>
      <strong style={{ fontSize: 20 }}>{value}</strong>
    </div>
  );
}
