import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PromotionReviewActions } from "@/components/PromotionReviewActions";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// This route existed in NavBar already (pointing at /promotions) but had
// no page behind it until now — same "link wired before the page existed"
// situation documented for /evaluations and /calibration before their
// first screens were built.
export default async function PromotionsPage() {
  const t = await getTranslations("PromotionsPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (promotions_select: self-row OR
  // check_vpra('promotions','view', employee's org_unit_id)) — a plain
  // employee sees only their own promotion record. Two FKs to job_titles
  // and a direct FK to profiles both need explicit relationship hints —
  // verified this exact query shape against the REST API with a real
  // temporary row before writing it, same habit as career_path/employees.
  const { data } = await supabase
    .from("promotions")
    .select(
      "id, status, employee:profiles!promotions_employee_id_fkey(employee_number,full_name_ar), evaluation_cycles(name_ar), from_job_title:job_titles!from_job_title_id(name_ar,grade_level), to_job_title:job_titles!to_job_title_id(name_ar,grade_level)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const promotions = data as unknown as Array<{
    id: string;
    status: string;
    employee: { employee_number: string; full_name_ar: string } | null;
    evaluation_cycles: { name_ar: string } | null;
    from_job_title: { name_ar: string; grade_level: number } | null;
    to_job_title: { name_ar: string; grade_level: number } | null;
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/promotions/history" className="sru-btn sru-btn-primary">
            {t("approvalHistory")}
          </Link>
          <Link href="/promotions/new" className="sru-btn sru-btn-primary">
            {t("newPromotion")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!promotions || promotions.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnFrom")}</th>
                  <th>{t("columnTo")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion) => (
                  <tr key={promotion.id}>
                    <td>
                      {promotion.employee?.employee_number} — {promotion.employee?.full_name_ar}
                    </td>
                    <td>{promotion.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>
                      {promotion.from_job_title
                        ? `${promotion.from_job_title.name_ar} (${t("gradeLabel", { grade: promotion.from_job_title.grade_level })})`
                        : "—"}
                    </td>
                    <td>
                      {promotion.to_job_title
                        ? `${promotion.to_job_title.name_ar} (${t("gradeLabel", { grade: promotion.to_job_title.grade_level })})`
                        : "—"}
                    </td>
                    <td>{promotion.status}</td>
                    <td>
                      {promotion.status === "pending" && (
                        <PromotionReviewActions promotionId={promotion.id} />
                      )}
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
