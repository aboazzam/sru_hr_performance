import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { getThreeSixtyReport } from "./reportData";

export default async function ThreeSixtyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>;
}) {
  const { employeeId: requestedEmployeeId } = await searchParams;
  const t = await getTranslations("ThreeSixtyReportPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id, full_name_ar").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  if (!myProfile) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty/report" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  let targetEmployeeId = myProfile.id;
  let targetName = myProfile.full_name_ar;
  let authorized = true;

  if (requestedEmployeeId && requestedEmployeeId !== myProfile.id) {
    const { data: isSubordinate } = await supabase.rpc("is_my_subordinate", { target_employee_id: requestedEmployeeId });
    authorized = Boolean(isSubordinate);
    if (authorized) {
      targetEmployeeId = requestedEmployeeId;
      // A plain manager typically holds neither `employeeData` nor
      // `employeeDataSubordinates` -- `profiles_select`'s own RLS
      // (20260725000009) requires the LATTER specifically even though
      // `is_my_subordinate()` above already confirmed the relationship, so
      // a direct profiles read here would render blank for most managers
      // (same class of gap fixed elsewhere in this module). Reused
      // get_my_direct_reports() instead -- this page is only ever linked
      // to from the team-report list, which is itself scoped to direct
      // reports, so the name is always resolvable there; a deeper
      // subordinate (reached by some other route) degrades to a blank
      // name rather than crashing, a known, narrower limitation.
      const { data: reports } = await supabase.rpc("get_my_direct_reports");
      targetName =
        ((reports ?? []) as { id: string; full_name_ar: string }[]).find((r) => r.id === requestedEmployeeId)
          ?.full_name_ar ?? "";
    }
  }

  if (!authorized) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty/report" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const report = await getThreeSixtyReport(supabase, targetEmployeeId);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/report" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{targetName}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!report ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoReport")}</p>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{report.cycle.nameAr}</p>
          {report.overallScore != null && (
            <p style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
              {report.overallScore.toFixed(1)}
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--sru-muted)" }}> {t("overallScoreLabel")}</span>
            </p>
          )}

          {report.competencyBreakdown.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("competencyHeading")}</h2>
              <div className="sru-card" style={{ marginBottom: 24 }}>
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnCompetency")}</th>
                        <th>{t("columnScore")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.competencyBreakdown.map((c) => (
                        <tr key={c.competencyId}>
                          <td>{c.nameAr}</td>
                          <td>{c.score.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {report.groupBreakdown.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("groupHeading")}</h2>
              <div className="sru-card" style={{ marginBottom: 24 }}>
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnGroup")}</th>
                        <th>{t("columnSubmitted")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.groupBreakdown.map((g) => (
                        <tr key={g.relationshipCode}>
                          <td>{g.nameAr}</td>
                          <td>
                            {g.submitted} / {g.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {report.foldedGroupCount > 0 && (
                <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginTop: -14, marginBottom: 24 }}>
                  {t("foldedGroupsNote", { count: report.foldedGroupCount })}
                </p>
              )}
            </>
          )}

          {report.openTextComments.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("commentsHeading")}</h2>
              <div className="sru-card">
                {report.openTextComments.map((c, i) => (
                  <div key={i} style={{ marginBottom: i < report.openTextComments.length - 1 ? 14 : 0 }}>
                    <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sru-muted)" }}>{c.itemText}</p>
                    <p style={{ fontSize: 13 }}>{c.answer}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
