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
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar")
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

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 && jobTitles && jobTitles.length > 0 ? (
        <ProposePromotionForm
          locale={locale}
          employees={employees}
          cycles={cycles ?? []}
          jobTitles={jobTitles}
        />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
