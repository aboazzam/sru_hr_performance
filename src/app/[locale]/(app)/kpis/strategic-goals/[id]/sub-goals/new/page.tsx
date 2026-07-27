import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewSubGoalForm } from "@/components/NewSubGoalForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — the real gate is
// sub_goals_insert's own RLS (strategy_admin only).
export default async function NewSubGoalPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id: strategicGoalId } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewSubGoalPage");
  const supabase = await createClient();

  const { data: strategicGoal } = await supabase
    .from("strategic_goals")
    .select("id, title_ar")
    .eq("id", strategicGoalId)
    .maybeSingle();

  // list_org_structure_positions(): a SECURITY DEFINER RPC, not the
  // caller's RLS-respecting client -- org_structure_positions_select
  // requires orgStructure=view (hr_admin/super_admin only), which
  // strategy_admin doesn't hold, so a plain table query here would come
  // back empty for the very role this page is built for.
  const { data: positions } = await supabase.rpc("list_org_structure_positions");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <p style={{ fontSize: 14, marginTop: 8, marginBottom: 20 }}>
        <strong>{t("strategicGoalLabel")}:</strong> {strategicGoal?.title_ar ?? "—"}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewSubGoalForm
        locale={locale}
        strategicGoalId={strategicGoalId}
        positions={(positions ?? []) as Array<{ id: string; name_ar: string }>}
      />
    </div>
  );
}
