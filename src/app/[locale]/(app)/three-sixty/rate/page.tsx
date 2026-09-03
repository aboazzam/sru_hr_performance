import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { threeSixtyAssignmentStatusLabels, type ThreeSixtyAssignmentStatus } from "@/lib/threeSixty";

export default async function ThreeSixtyRateListPage() {
  const t = await getTranslations("ThreeSixtyRateListPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  // three_sixty_assignments_select's own self-row branch (rater_employee_id
  // = caller) is the real gate here -- no VPRA grant needed. The subject's
  // NAME, though, needs get_my_three_sixty_rating_subjects(): an ordinary
  // rater (no employeeData grant) has no profiles_select branch letting
  // them read a colleague's name just because they were assigned to rate
  // them -- found live during this module's own verification, see that
  // RPC's migration header.
  const [{ data: assignments }, { data: subjectRows }] = myProfile
    ? await Promise.all([
        supabase
          .from("three_sixty_assignments")
          .select("id, relationship_code, status, subject_employee_id, three_sixty_cycles(name_ar, status)")
          .eq("rater_employee_id", myProfile.id)
          .neq("status", "excluded")
          .is("deleted_at", null),
        supabase.rpc("get_my_three_sixty_rating_subjects"),
      ])
    : [{ data: null }, { data: null }];
  const subjectNameById = new Map(
    ((subjectRows ?? []) as { subject_id: string; subject_name: string }[]).map((r) => [r.subject_id, r.subject_name])
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/rate" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!assignments || assignments.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnSubject")}</th>
                  <th>{t("columnRelationship")}</th>
                  <th>{t("columnStatus")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const cycle = a.three_sixty_cycles as unknown as { name_ar: string; status: string } | null;
                  const status = a.status as ThreeSixtyAssignmentStatus;
                  return (
                    <tr key={a.id}>
                      <td>{cycle?.name_ar ?? "—"}</td>
                      <td>{subjectNameById.get(a.subject_employee_id) ?? "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{a.relationship_code}</td>
                      <td>
                        <span className="pill">{threeSixtyAssignmentStatusLabels[status]}</span>
                      </td>
                      <td className="no-print">
                        <Link href={`/three-sixty/rate/${a.id}`} className="sru-btn">
                          {status === "submitted" ? t("viewButton") : t("fillButton")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
