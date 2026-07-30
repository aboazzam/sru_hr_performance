import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignTargetForm } from "@/components/AssignTargetForm";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — the real gate is
// targets_insert's own RLS (current owner of the immediate parent).
export default async function AssignTargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ subGoalId?: string; parentTargetId?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const { subGoalId, parentTargetId } = await searchParams;
  const t = await getTranslations("AssignTargetPage");
  const supabase = await createClient();

  // The KPI a cascaded target serves depends on where it is being cascaded
  // FROM (2026-07-30):
  //   - from a sub-goal -> the cascader picks among that sub-goal's KPIs.
  //   - from another target -> it necessarily refines the SAME indicator,
  //     so the parent's kpi_id is inherited and not offered as a choice.
  let parentTitle = "—";
  let subGoalIdForKpis: string | null = null;
  let inheritedKpiId: string | null = null;

  if (subGoalId) {
    const { data } = await supabase.from("sub_goals").select("title_ar").eq("id", subGoalId).maybeSingle();
    parentTitle = data?.title_ar ?? "—";
    subGoalIdForKpis = subGoalId;
  } else if (parentTargetId) {
    const { data } = await supabase.from("targets").select("title_ar, kpi_id").eq("id", parentTargetId).maybeSingle();
    parentTitle = data?.title_ar ?? "—";
    inheritedKpiId = data?.kpi_id ?? null;
  }

  const { data: kpisData } = subGoalIdForKpis
    ? await supabase
        .from("strategic_kpis")
        .select("id, title_ar, unit_ar")
        .eq("sub_goal_id", subGoalIdForKpis)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
    : inheritedKpiId
      ? await supabase.from("strategic_kpis").select("id, title_ar, unit_ar").eq("id", inheritedKpiId).is("deleted_at", null)
      : { data: [] };
  const kpis = (kpisData ?? []) as Array<{ id: string; title_ar: string; unit_ar: string }>;

  const { data: cyclesData } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  const cycles = (cyclesData ?? []) as Array<{ id: string; name_ar: string }>;

  const [{ data: positions }, { data: employees }] = await Promise.all([
    supabase.rpc("list_org_structure_positions"),
    supabase.rpc("list_profiles_for_cascade"),
  ]);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href="/kpis"
        className="sru-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backButton")}
      </Link>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <p style={{ fontSize: 14, marginTop: 8, marginBottom: 20 }}>
        <strong>{t("parentContextLabel")}:</strong> {parentTitle}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {/* kpi_id and cycle_id are both required on a cascaded target now, so
          a form with nothing to select for either could only ever fail --
          point at the cause instead of rendering it. */}
      {kpis.length === 0 || cycles.length === 0 ? (
        <div className="sru-card" style={{ padding: 16 }}>
          <p style={{ fontSize: 14 }}>{kpis.length === 0 ? t("noKpisMessage") : t("noCyclesMessage")}</p>
        </div>
      ) : (
        <AssignTargetForm
          locale={locale}
          subGoalId={subGoalId}
          parentTargetId={parentTargetId}
          kpis={kpis}
          cycles={cycles}
          inheritedKpiId={inheritedKpiId}
          positions={(positions ?? []) as Array<{ id: string; name_ar: string }>}
          employees={(employees ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>}
        />
      )}
    </div>
  );
}
