import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProposePromotionForm } from "@/components/ProposePromotionForm";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// promotions_insert's own RLS requires check_vpra('promotions','recommend',
// org_unit_id) — no individual/self role holds any grant on `promotions` at
// all, so this form was previously reachable and fully renderable by any
// authenticated user (same bug class found in the audit that fixed
// kpis/strategic-goals). Gated here at the flat `promotions>=recommend`
// bar as a page-level pre-check; the real per-org-unit boundary stays
// promotions_insert's own RLS, unchanged.
export default async function ProposePromotionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("ProposePromotionPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const promotionsLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "promotions"
    )?.vpra_level ?? "none";
  const canPropose = hasVpraAccess(promotionsLevel, "recommend");

  if (!canPropose) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // RLS-scoped to the caller, same "seeing an option here doesn't
  // guarantee the insert succeeds" caveat as every other create screen —
  // the real authorization boundary is promotions_insert's own RLS.
  // job_title_id comes along so the form can prefill "from" with the title
  // already recorded on the employee's own profile instead of asking the
  // proposer to retype what the database already knows.
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, job_title_id")
    .is("deleted_at", null)
    .order("employee_number");

  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const { data: jobTitles } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level")
    .is("deleted_at", null)
    .order("grade_level");

  // The real career ladder, so the "to" list can be narrowed to the moves it
  // actually defines out of the employee's current title. Read through the
  // caller's own client — no edges (e.g. no `careerPath` grant) simply means
  // no narrowing offered, never a broken form.
  const { data: careerEdgeRows } = await supabase
    .from("career_path")
    .select("from_job_title_id, to_job_title_id")
    .is("deleted_at", null);
  const careerEdges = (careerEdgeRows ?? []).map((edge) => ({
    fromJobTitleId: edge.from_job_title_id,
    toJobTitleId: edge.to_job_title_id,
  }));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 && jobTitles && jobTitles.length > 0 && cycles && cycles.length > 0 ? (
        <ProposePromotionForm
          locale={locale}
          employees={employees}
          cycles={cycles}
          jobTitles={jobTitles}
          careerEdges={careerEdges}
        />
      ) : cycles && cycles.length === 0 ? (
        // `cycleId` is required (`proposePromotionSchema`/the form's own
        // <select required>) — with zero real evaluation_cycles rows, the
        // form used to render anyway with an empty, unselectable cycle
        // dropdown, silently blocking every submission behind a raw,
        // unlocalized native browser validation message. Same root cause
        // (zero evaluation_cycles) as the calibration create-session fix,
        // a distinct honest message instead of pretending it's a
        // permission problem.
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorNoData")}</p>
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
