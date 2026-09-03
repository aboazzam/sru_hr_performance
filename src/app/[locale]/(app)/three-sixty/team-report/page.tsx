import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";

// Screen 5 ("المدير: تقارير أعضاء فريقه فقط") -- scoped to DIRECT reports
// only (get_my_direct_reports(), same one-level scope already established
// for "My Team's Evaluations" elsewhere in this app), not the full
// recursive subordinate chain -- a manager wanting a report two levels
// down opens it from that direct report's own team-report page in turn.
export default async function ThreeSixtyTeamReportPage() {
  const t = await getTranslations("ThreeSixtyTeamReportPage");
  const supabase = await createClient();

  const { data: reports } = await supabase.rpc("get_my_direct_reports");
  const reportList = (reports ?? []) as { id: string; employee_number: string; full_name_ar: string }[];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/team-report" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {reportList.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {reportList.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      {employee.full_name_ar} ({employee.employee_number})
                    </td>
                    <td className="no-print">
                      <Link href={`/three-sixty/report?employeeId=${employee.id}`} className="sru-btn">
                        {t("viewReportButton")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
