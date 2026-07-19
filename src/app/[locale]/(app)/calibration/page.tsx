import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// This route existed in NavBar already (pointing at /calibration) but had
// no page behind it until now — same "link wired before the page existed"
// situation documented for /evaluations before its first screen was built.
export default async function CalibrationSessionsPage() {
  const t = await getTranslations("CalibrationSessionsPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (calibration_sessions_select:
  // check_vpra('calibration','view', org_unit_id)) — org-unit-scoped
  // roles only see sessions in their own scope; a plain employee (who
  // holds no 'calibration' grant at all per the real seeded matrix) sees
  // none, matching the table's own RLS design from migration
  // 20260719000004, not a special case here.
  const { data } = await supabase
    .from("calibration_sessions")
    .select("id, status, mode, notes, evaluation_cycles(name_ar), org_units(name_ar)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const sessions = data as unknown as Array<{
    id: string;
    status: string;
    mode: string;
    notes: string | null;
    evaluation_cycles: { name_ar: string } | null;
    org_units: { name_ar: string } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <Link href="/calibration/new" className="sru-btn sru-btn-primary">
          {t("newSession")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!sessions || sessions.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnNotes")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>{session.org_units?.name_ar ?? "—"}</td>
                    <td>{session.status}</td>
                    <td>{session.notes ?? "—"}</td>
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
