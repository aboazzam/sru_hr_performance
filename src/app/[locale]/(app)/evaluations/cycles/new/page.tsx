import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewEvaluationCycleForm } from "@/components/NewEvaluationCycleForm";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Real write gate is evaluation_cycles_insert's own RLS
// (check_vpra_global('evaluation','approve'), hr_admin-only). This page had
// NO page-level check at all (found in the same audit that fixed
// kpis/strategic-goals) — the sibling /evaluations list page already
// computes this exact flag (canCreateCycle) to hide its own "Add Cycle"
// link, but this page never applied it, so the create form was reachable
// by any authenticated user who hit the URL directly.
export default async function NewEvaluationCyclePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewEvaluationCyclePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const evaluationLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "evaluation"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(evaluationLevel, "approve");

  if (!canCreate) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewEvaluationCycleForm locale={locale} />
    </div>
  );
}
