import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignTargetForm } from "@/components/AssignTargetForm";
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

  let parentTitle = "—";
  if (subGoalId) {
    const { data } = await supabase.from("sub_goals").select("title_ar").eq("id", subGoalId).maybeSingle();
    parentTitle = data?.title_ar ?? "—";
  } else if (parentTargetId) {
    const { data } = await supabase.from("targets").select("title_ar").eq("id", parentTargetId).maybeSingle();
    parentTitle = data?.title_ar ?? "—";
  }

  const [{ data: positions }, { data: employees }] = await Promise.all([
    supabase.rpc("list_org_structure_positions"),
    supabase.rpc("list_profiles_for_cascade"),
  ]);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <p style={{ fontSize: 14, marginTop: 8, marginBottom: 20 }}>
        <strong>{t("parentContextLabel")}:</strong> {parentTitle}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <AssignTargetForm
        locale={locale}
        subGoalId={subGoalId}
        parentTargetId={parentTargetId}
        positions={(positions ?? []) as Array<{ id: string; name_ar: string }>}
        employees={(employees ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>}
      />
    </div>
  );
}
