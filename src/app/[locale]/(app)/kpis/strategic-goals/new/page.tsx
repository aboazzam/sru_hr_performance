import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewStrategicGoalForm } from "@/components/NewStrategicGoalForm";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx — the real write gate is
// strategic_goals_insert's own RLS (strategy_admin only). This page-level
// check is an addition, not a replacement: a real bug found live in
// production (2026-07-28) showed this entire create form (cycle picker,
// title, target, unit, weight, submit) to any authenticated user who hit
// this URL directly, since only the nav link was gated — submitting would
// have correctly failed server-side via RLS, but per CLAUDE.md §5-A rule 4
// ("never rely on UI-only protection") the page itself must not render the
// form for a caller who can never legitimately submit it.
export default async function NewStrategicGoalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewStrategicGoalPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const strategicPlanningLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(strategicPlanningLevel, "approve");

  if (!canCreate) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // Same identity-completeness gate as /kpis/strategic-goals -- see that
  // page's comment. Checked again here since this route is reachable
  // directly, not only via the list page's conditional button.
  const { data: identity } = await supabase.from("strategic_identity").select("vision_ar, mission_ar").maybeSingle();
  const { count: valuesCount } = await supabase
    .from("strategic_values")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const identityComplete = Boolean(identity?.vision_ar?.trim() && identity?.mission_ar?.trim() && (valuesCount ?? 0) > 0);

  if (!identityComplete) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <h1 className="sru-title" style={{ fontSize: 24 }}>
          {t("title")}
        </h1>
        <div className="sru-diag" style={{ margin: "8px 0 28px" }} />
        <div className="sru-card" style={{ padding: 16 }}>
          <p style={{ fontSize: 14 }}>
            {t("identityGateMessage")}{" "}
            <Link href="/kpis/strategic-identity" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
              {t("identityLinkButton")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewStrategicGoalForm locale={locale} cycles={cycles ?? []} />
    </div>
  );
}
