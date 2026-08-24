import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { planStatusLabel, requestStatusLabel } from "@/lib/recruitmentWorkflow";
import type { Locale } from "@/i18n/config";

// سجل التدقيق للخطة. Reads `audit_log` through the caller's own client: the
// narrowly-scoped policy added in 20260807000006 exposes ONLY
// entity IN ('recruitment_plans','recruitment_requests'), so this page
// cannot leak any other action type even if it asked for one.
//
// The ACTOR NAME is resolved through the service-role client instead —
// `audit_log.actor_id` points at `auth.users`, and `profiles_select`'s RLS
// would hide most actors from most readers, leaving a log of anonymous
// events. Same trade-off already accepted on /admin/user-activity: the page
// gate above decides who may read this at all, so resolving names below it
// widens nothing.
const actionLabels: Record<string, string> = {
  recruitment_plan_transitioned: "تغيير حالة الخطة",
  recruitment_plan_finance_reviewed: "تسجيل المراجعة المالية",
  recruitment_plan_recommendation_saved: "حفظ توصية الموارد البشرية",
  recruitment_plan_item_added: "إضافة بند",
  recruitment_plan_item_updated: "تعديل بند",
  recruitment_plan_item_deleted: "حذف بند",
  recruitment_requests_consolidated: "دمج طلبات في الخطة",
  recruitment_request_created: "إنشاء طلب احتياج",
  recruitment_request_updated: "تعديل طلب",
  recruitment_request_deleted: "حذف طلب",
  recruitment_request_transitioned: "تغيير حالة طلب",
  recruitment_request_priced: "تسعير طلب",
  recruitment_plan_item_published: "نشر بند كشاغر",
};

export default async function PlanAuditPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("RecruitmentAuditPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: Partial<Record<ProcessArea, VpraLevel>> = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  const canView =
    hasVpraAccess(permissions.recruitmentPlan ?? "none", "view") ||
    hasVpraAccess(permissions.recruitmentBudget ?? "none", "view");

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, name_ar, plan_year")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  // The plan's own entries plus those of every request riding on it.
  const { data: planRequests } = canView
    ? await supabase.from("recruitment_requests").select("id").eq("plan_id", id)
    : { data: [] };
  const entityIds = [id, ...((planRequests ?? []).map((row) => row.id) as string[])];

  const { data: entries } = canView
    ? await supabase
        .from("audit_log")
        .select("id, action, entity, entity_id, actor_id, before_data, after_data, created_at")
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] };

  const actorIds = [...new Set((entries ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const admin = createAdminClient();
  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("auth_user_id, full_name_ar").in("auth_user_id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.auth_user_id, a.full_name_ar]));

  const timeZone = await getDisplayTimezone(supabase);
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { timeZone });

  /** Renders a transition as "من ← إلى" using the shared status vocabularies. */
  const describe = (entry: {
    entity: string;
    action: string;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
  }) => {
    const after = entry.after_data ?? {};
    const label = entry.entity === "recruitment_plans" ? planStatusLabel : requestStatusLabel;
    const from = (after.from ?? entry.before_data?.status) as string | undefined;
    const to = (after.to ?? after.status) as string | undefined;
    if (from && to) return `${label(from)} ← ${label(to)}`;
    if (to) return label(to);
    if (typeof after.note === "string" && after.note) return after.note;
    return "—";
  };

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      {plan && (
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
          {plan.name_ar} — {plan.plan_year}
        </p>
      )}
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <Link href={`/recruitment/plan/${id}`} className="sru-btn">
        {t("backToPlan")}
      </Link>

      <div style={{ marginTop: 20 }}>
        {!canView ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("forbidden")}</p>
        ) : !entries || entries.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
        ) : (
          <div className="sru-card">
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("columnWhen")}</th>
                    <th>{t("columnWho")}</th>
                    <th>{t("columnWhat")}</th>
                    <th>{t("columnDetails")}</th>
                    <th>{t("columnNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="sru-en" style={{ whiteSpace: "nowrap" }}>
                        {formatDate(entry.created_at)}
                      </td>
                      <td>{(entry.actor_id && actorName.get(entry.actor_id)) ?? "—"}</td>
                      <td>{actionLabels[entry.action] ?? entry.action}</td>
                      <td>{describe(entry)}</td>
                      <td style={{ maxWidth: 320 }}>
                        {(entry.after_data?.note as string) ??
                          (entry.after_data?.finance_note as string) ??
                          "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
