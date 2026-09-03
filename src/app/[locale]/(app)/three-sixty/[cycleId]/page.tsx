import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { threeSixtyAssignmentStatusLabels, type ThreeSixtyAssignmentStatus } from "@/lib/threeSixty";
import { GenerateFixedAssignmentsButton } from "@/components/GenerateFixedAssignmentsButton";
import { ExcludeAssignmentButton } from "@/components/ExcludeAssignmentButton";

export default async function ThreeSixtyCycleDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  const t = await getTranslations("ThreeSixtyCycleDetailPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [
      row.process_area,
      row.vpra_level,
    ])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canManage = hasVpraAccess(permissions.threeSixty ?? "none", "prepare");
  const canViewAggregate = hasVpraAccess(permissions.threeSixty ?? "none", "view");
  const isApprove = hasVpraAccess(permissions.threeSixty ?? "none", "approve");

  const { data: cycle } = await supabase
    .from("three_sixty_cycles")
    .select("id, cycle_code, name_ar, status, owner_id")
    .eq("id", cycleId)
    .maybeSingle();

  if (!cycle) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const isOwner = myProfile != null && cycle.owner_id === myProfile.id;
  // Screen 1's privacy rule: only the cycle's own owner, or an
  // approve-level HR override, may see WHO specifically has/hasn't
  // submitted -- everyone else with a plain `view` grant gets the
  // aggregate-only RPC below and nothing row-level.
  const canSeeIdentityDetail = isOwner || isApprove;

  const { data: completionRows } = canViewAggregate
    ? await supabase.rpc("three_sixty_completion_by_org_unit", { p_cycle_id: cycleId })
    : { data: null };

  // `three_sixty_assignments_select` already lets the owner/approve-level
  // caller read these ROWS, but the subject/rater NAMES need
  // `get_three_sixty_assignment_names()` -- `profiles_select`'s own RLS has
  // no branch for "holds threeSixty>=approve," only employeeData/self/
  // created_by, confirmed live during this module's own verification (see
  // that RPC's migration header).
  const [{ data: assignmentRows }, { data: nameRows }] = canSeeIdentityDetail
    ? await Promise.all([
        supabase
          .from("three_sixty_assignments")
          .select("id, relationship_code, status, subject_employee_id, rater_employee_id")
          .eq("cycle_id", cycleId)
          .is("deleted_at", null)
          .order("relationship_code"),
        supabase.rpc("get_three_sixty_assignment_names", { p_cycle_id: cycleId }),
      ])
    : [{ data: null }, { data: null }];
  const nameById = new Map(((nameRows ?? []) as { id: string; full_name_ar: string }[]).map((n) => [n.id, n.full_name_ar]));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {cycle.name_ar}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>{cycle.cycle_code}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!canViewAggregate ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      ) : (
        <>
          {canManage && (
            <div className="sru-actionbar no-print" style={{ marginBottom: 20 }}>
              <GenerateFixedAssignmentsButton cycleId={cycle.id} />
            </div>
          )}

          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("completionHeading")}</h2>
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 12 }}>{t("completionNote")}</p>
          <div className="sru-card" style={{ marginBottom: 28 }}>
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("columnOrgUnit")}</th>
                    <th>{t("columnTotal")}</th>
                    <th>{t("columnSubmitted")}</th>
                    <th>{t("columnPercent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(completionRows ?? []).map(
                    (row: { org_unit_id: string | null; org_unit_name_ar: string | null; total_assignments: number; submitted_count: number }) => (
                      <tr key={row.org_unit_id ?? "none"}>
                        <td>{row.org_unit_name_ar ?? t("noOrgUnit")}</td>
                        <td>{row.total_assignments}</td>
                        <td>{row.submitted_count}</td>
                        <td>{row.total_assignments > 0 ? Math.round((row.submitted_count / row.total_assignments) * 100) : 0}%</td>
                      </tr>
                    )
                  )}
                  {(!completionRows || completionRows.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ color: "var(--sru-muted)", textAlign: "center" }}>
                        {t("empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {canSeeIdentityDetail && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("detailHeading")}</h2>
              <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 12 }}>{t("detailNote")}</p>
              <div className="sru-card">
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnSubject")}</th>
                        <th>{t("columnRater")}</th>
                        <th>{t("columnRelationship")}</th>
                        <th>{t("columnStatus")}</th>
                        {canManage && <th className="no-print">{t("columnActions")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(assignmentRows ?? []).map((row) => {
                        const status = row.status as ThreeSixtyAssignmentStatus;
                        return (
                          <tr key={row.id}>
                            <td>{nameById.get(row.subject_employee_id) ?? "—"}</td>
                            <td>{nameById.get(row.rater_employee_id) ?? "—"}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.relationship_code}</td>
                            <td>
                              <span className="pill">{threeSixtyAssignmentStatusLabels[status]}</span>
                            </td>
                            {canManage && (
                              <td className="no-print">
                                {status !== "excluded" && <ExcludeAssignmentButton assignmentId={row.id} label={t("excludeButton")} />}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {(!assignmentRows || assignmentRows.length === 0) && (
                        <tr>
                          <td colSpan={canManage ? 5 : 4} style={{ color: "var(--sru-muted)", textAlign: "center" }}>
                            {t("empty")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
