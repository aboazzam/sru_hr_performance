import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EnterRewardForm } from "@/components/EnterRewardForm";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// rewards_insert's own RLS requires check_vpra('promotions','recommend',
// org_unit_id) (rewards reuses the `promotions` process area — no dedicated
// one exists) — no individual/self role holds any grant at all, so this
// form was previously reachable and fully renderable by any authenticated
// user (same bug class found in the audit that fixed kpis/strategic-goals).
// Gated here at the flat `promotions>=recommend` bar as a page-level
// pre-check; the real per-org-unit boundary stays rewards_insert's own RLS.
export default async function EnterRewardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("EnterRewardPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const promotionsLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "rewardsAndRecommendations"
    )?.vpra_level ?? "none";
  const canEnter = hasVpraAccess(promotionsLevel, "recommend");

  if (!canEnter) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // RLS-scoped to the caller, same "seeing an option here doesn't
  // guarantee the insert succeeds" caveat as every other create screen —
  // the real authorization boundary is rewards_insert's own RLS.
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

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 ? (
        <EnterRewardForm locale={locale} employees={employees} cycles={cycles ?? []} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
