import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { PromotionsTable, type PromotionRowView } from "@/components/PromotionsTable";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { classifyPromotionAgainstCareerPath } from "@/lib/promotionStatus";

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
      "id, status, from_job_title_id, to_job_title_id, employee:profiles!promotions_employee_id_fkey(employee_number,full_name_ar), evaluation_cycles(name_ar), from_job_title:job_titles!from_job_title_id(name_ar,grade_level), to_job_title:job_titles!to_job_title_id(name_ar,grade_level)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const promotions = data as unknown as Array<{
    id: string;
    status: string;
    from_job_title_id: string | null;
    to_job_title_id: string;
    employee: { employee_number: string; full_name_ar: string } | null;
    evaluation_cycles: { name_ar: string } | null;
    from_job_title: { name_ar: string; grade_level: number } | null;
    to_job_title: { name_ar: string; grade_level: number } | null;
  }> | null;

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const promotionsLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "promotions"
    )?.vpra_level ?? "none";
  // Mirrors promotions_update's own RLS bar; hiding the buttons is
  // presentation only — Postgres remains the gate, and reviewPromotion
  // still returns "forbidden" for anyone who slips past the UI.
  const canReview = hasVpraAccess(promotionsLevel, "recommend");
  const canPropose = canReview;

  // The real career ladder (155+ edges built from the university's own
  // Career Path workbook, 20260720000002 onwards), read through the
  // caller's own client — a caller without `careerPath>=view` simply gets
  // no edges and therefore no badge, rather than an error.
  const { data: careerEdges } = await supabase
    .from("career_path")
    .select("from_job_title_id, to_job_title_id")
    .is("deleted_at", null);
  const edges = (careerEdges ?? []).map((e) => ({
    fromJobTitleId: e.from_job_title_id,
    toJobTitleId: e.to_job_title_id,
  }));

  const rows: PromotionRowView[] = (promotions ?? []).map((promotion) => ({
    id: promotion.id,
    employeeNumber: promotion.employee?.employee_number ?? null,
    employeeName: promotion.employee?.full_name_ar ?? null,
    cycleName: promotion.evaluation_cycles?.name_ar ?? null,
    fromTitleName: promotion.from_job_title?.name_ar ?? null,
    fromGrade: promotion.from_job_title?.grade_level ?? null,
    toTitleName: promotion.to_job_title?.name_ar ?? null,
    toGrade: promotion.to_job_title?.grade_level ?? null,
    status: promotion.status,
    careerPathMatch:
      edges.length === 0
        ? "unknown"
        : classifyPromotionAgainstCareerPath(promotion.from_job_title_id, promotion.to_job_title_id, edges),
  }));

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
          <Link href="/promotions/history" className="sru-btn">
            {t("approvalHistory")}
          </Link>
          {/* /promotions/new already blocks anyone below `recommend` with a
              forbidden message; hiding it here just stops offering an action
              that Postgres would refuse. */}
          {canPropose && (
            <Link href="/promotions/new" className="sru-btn sru-btn-primary">
              {t("newPromotion")}
            </Link>
          )}
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      {/* Member of the "التوظيف" group (2026-08-04) — its tab bar, same
          pattern as every other grouped page. */}
      <GroupTabs groupKey="recruitment" current="promotions" />
      <div style={{ height: 20 }} />

      <PromotionsTable promotions={rows} canReview={canReview} />
    </div>
  );
}
