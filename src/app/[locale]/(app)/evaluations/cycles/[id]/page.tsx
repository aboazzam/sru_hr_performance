import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { RowLink } from "@/components/RowLink";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { formatDateDmy } from "@/lib/dateParts";
import { CycleMethodWeightsForm } from "@/components/CycleMethodWeightsForm";
import { OrgUnitWeightsManager, type OrgUnitWeightsRow } from "@/components/OrgUnitWeightsManager";
import type { MethodWeights } from "@/lib/evaluationCycle";

import {
  canAdvanceEvaluationState,
  evaluationStateLabels,
  evalTypeLabels,
  type EvalType,
  type EvaluationState,
  hasVpraAccess,
  type ProcessArea,
  type RoleCode,
  type VpraLevel,
} from "@/lib/vpra";

/**
 * One evaluation cycle: who is in it, and what is waiting on me.
 *
 * Two lists only (2026-08-27). The four evaluation methods used to be the
 * headings here; they moved INSIDE a single employee's evaluation, which is
 * where a method actually means something — you score a person's competencies,
 * not "the competencies" in the abstract.
 *
 * Both lists are filtered explicitly rather than left to evaluations_select's
 * RLS: its approve-level branch would otherwise show hr_admin every evaluation
 * in the system under "my team".
 */

type EvaluationRow = {
  id: string;
  state: EvaluationState;
  eval_type: EvalType;
  employee_id: string;
  profiles: { full_name_ar: string; employee_number: string } | null;
};

export default async function EvaluationCyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("EvaluationCyclePage");
  const tCycles = await getTranslations("EvaluationCyclesPage");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("evaluation_cycles")
    .select(
      "id, name_ar, name_en, start_date, end_date, weight_activities, weight_competencies, weight_bau, weight_feedback_360"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cycle) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const evaluationLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "evaluation"
    )?.vpra_level ?? "none";
  const canEditWeights = hasVpraAccess(evaluationLevel, "approve");

  const { data: roleCodes } = await supabase.rpc("get_my_role_codes");
  const myRoles = (roleCodes ?? []) as RoleCode[];

  // Direct reports only — profiles.supervisor_id, the same relationship the
  // review policies use.
  const { data: reports } = myProfile
    ? await supabase.from("profiles").select("id").eq("supervisor_id", myProfile.id).is("deleted_at", null)
    : { data: null };
  const reportIds = (reports ?? []).map((r) => r.id);

  const { data: teamData } =
    reportIds.length > 0
      ? await supabase
          .from("evaluations")
          .select("id, state, eval_type, employee_id, profiles(full_name_ar, employee_number)")
          .eq("cycle_id", id)
          .in("employee_id", reportIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null };
  const teamEvaluations = (teamData ?? []) as unknown as EvaluationRow[];

  const { data: visibleData } = myProfile
    ? await supabase
        .from("evaluations")
        .select("id, state, eval_type, employee_id, profiles(full_name_ar, employee_number)")
        .eq("cycle_id", id)
        .neq("employee_id", myProfile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };
  const reviewEvaluations = ((visibleData ?? []) as unknown as EvaluationRow[]).filter((row) =>
    myRoles.some((role) => canAdvanceEvaluationState(row.state, role))
  );

  // "Scored" means a score actually exists for that evaluation — the honest
  // signal. The lifecycle state says where the paperwork is; this says whether
  // anyone has recorded anything yet, which is what the icon is asked to show.
  const shownIds = [...new Set([...teamEvaluations, ...reviewEvaluations].map((e) => e.id))];
  const { data: scoreRows } =
    shownIds.length > 0
      ? await supabase.from("evaluation_scores").select("evaluation_id").in("evaluation_id", shownIds).is("deleted_at", null)
      : { data: [] };
  const scoredIds = new Set(((scoreRows ?? []) as { evaluation_id: string }[]).map((r) => r.evaluation_id));

  const cycleWeights: MethodWeights = {
    activities: Number(cycle.weight_activities),
    competencies: Number(cycle.weight_competencies),
    bau: Number(cycle.weight_bau),
    feedback360: Number(cycle.weight_feedback_360),
  };

  // Departments listed are the ones this actually governs: those with staff,
  // plus any that already carries its own distribution (so a unit whose last
  // employee moved out does not silently drop its settings from view).
  const { data: staffRows } = await supabase
    .from("profiles")
    .select("org_unit_id")
    .not("org_unit_id", "is", null)
    .is("deleted_at", null);
  const employeeCountByUnit = new Map<string, number>();
  for (const row of (staffRows ?? []) as { org_unit_id: string }[]) {
    employeeCountByUnit.set(row.org_unit_id, (employeeCountByUnit.get(row.org_unit_id) ?? 0) + 1);
  }

  const { data: unitWeightRows } = await supabase
    .from("org_unit_evaluation_weights")
    .select("org_unit_id, weight_activities, weight_competencies, weight_bau, weight_feedback_360")
    .eq("cycle_id", cycle.id)
    .is("deleted_at", null);
  const ownWeightsByUnit = new Map<string, MethodWeights>();
  for (const row of (unitWeightRows ?? []) as Array<{
    org_unit_id: string;
    weight_activities: number;
    weight_competencies: number;
    weight_bau: number;
    weight_feedback_360: number;
  }>) {
    ownWeightsByUnit.set(row.org_unit_id, {
      activities: Number(row.weight_activities),
      competencies: Number(row.weight_competencies),
      bau: Number(row.weight_bau),
      feedback360: Number(row.weight_feedback_360),
    });
  }

  const relevantUnitIds = [...new Set([...employeeCountByUnit.keys(), ...ownWeightsByUnit.keys()])];
  const { data: unitRows } =
    relevantUnitIds.length > 0
      ? await supabase.from("org_units").select("id, name_ar").in("id", relevantUnitIds).is("deleted_at", null)
      : { data: [] };
  const orgUnitWeightRows: OrgUnitWeightsRow[] = ((unitRows ?? []) as Array<{ id: string; name_ar: string }>)
    .map((unit) => ({
      orgUnitId: unit.id,
      nameAr: unit.name_ar,
      employeeCount: employeeCountByUnit.get(unit.id) ?? 0,
      own: ownWeightsByUnit.get(unit.id) ?? null,
    }))
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  function table(rows: EvaluationRow[], emptyMessage: string) {
    if (rows.length === 0) return <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{emptyMessage}</p>;
    return (
      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              <th>{t("columnStatus")}</th>
              <th>{t("columnEmployee")}</th>
              <th>{t("columnEmployeeNumber")}</th>
              <th>{t("columnType")}</th>
              <th>{t("columnState")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const scored = scoredIds.has(row.id);
              return (
                <RowLink key={row.id} href={`/evaluations/${row.id}`}>
                  <td>
                    <span
                      title={scored ? t("statusScored") : t("statusAwaiting")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: scored ? "var(--sru-success, #1f9d55)" : "var(--sru-muted)",
                      }}
                    >
                      {scored ? <CheckCircle2 size={15} aria-hidden /> : <Clock size={15} aria-hidden />}
                      {scored ? t("statusScored") : t("statusAwaiting")}
                    </span>
                  </td>
                  <td>
                    <Link href={`/evaluations/${row.id}`} className="sru-row-link-title">
                      {row.profiles?.full_name_ar ?? "—"}
                    </Link>
                  </td>
                  <td>{row.profiles?.employee_number ?? "—"}</td>
                  <td>{evalTypeLabels[row.eval_type]}</td>
                  <td>{evaluationStateLabels[row.state]}</td>
                </RowLink>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const tabs: ProfileTab[] = [
    {
      id: "team",
      label: t("subTabTeam"),
      content: (
        <>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("teamNote")}</p>
          {table(teamEvaluations, t("teamEmpty"))}
        </>
      ),
    },
    {
      id: "review",
      label: t("subTabReview"),
      content: (
        <>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("reviewNote")}</p>
          {table(reviewEvaluations, t("reviewEmpty"))}
        </>
      ),
    },
    {
      id: "weights",
      label: t("subTabWeights"),
      content: (
        <>
          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>{tCycles("cycleDefaultWeightsHeading")}</h3>
          <CycleMethodWeightsForm cycleId={cycle.id} canEdit={canEditWeights} initial={cycleWeights} />

          <hr style={{ border: 0, borderTop: "1px solid var(--sru-border)", margin: "26px 0 18px" }} />

          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>{tCycles("unitsHeading")}</h3>
          <OrgUnitWeightsManager
            cycleId={cycle.id}
            cycleWeights={cycleWeights}
            rows={orgUnitWeightRows}
            canEdit={canEditWeights}
          />
        </>
      ),
    },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link href="/evaluations" className="sru-btn sru-btn-slim" style={{ marginBottom: 14, display: "inline-flex" }}>
        {t("backToCycles")}
      </Link>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {cycle.name_ar}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
        {tCycles("columnStart")}: {formatDateDmy(cycle.start_date, locale)} — {tCycles("columnEnd")}:{" "}
        {formatDateDmy(cycle.end_date, locale)}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
