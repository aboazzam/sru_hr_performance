import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getDisplayTimezone } from "@/lib/systemSettings";

type PromotionRewardAction = "promotion_reviewed" | "reward_reviewed";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// Backed by a new, narrowly-scoped RLS policy (20260719000010) --
// `audit_log` had been RLS-enabled with ZERO policies since its own
// creation, a deliberate default-deny. That migration adds exactly one
// SELECT policy restricted to entity IN ('promotions','rewards'),
// mirroring promotions_select/rewards_select's own real org-unit scoping;
// every other action type in audit_log stays completely unreadable, same
// as before.
//
// 2026-07-26: the decision-date column now renders via `getDisplayTimezone`
// (the new `system_settings` singleton) instead of the server's own
// timezone — same fix as /admin/user-activity's last-sign-in column, for
// the identical underlying bug.
export default async function PromotionsRewardsHistoryPage() {
  const t = await getTranslations("PromotionsRewardsHistoryPage");
  const supabase = await createClient();
  const displayTimezone = await getDisplayTimezone(supabase);

  const { data: entriesData } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, actor_id, before_data, after_data, created_at")
    .in("action", ["promotion_reviewed", "reward_reviewed"])
    .order("created_at", { ascending: false });

  const entries = (entriesData ?? []) as Array<{
    id: string;
    action: PromotionRewardAction;
    entity: "promotions" | "rewards";
    entity_id: string;
    actor_id: string | null;
    before_data: { status?: string } | null;
    after_data: { status?: string } | null;
    created_at: string;
  }>;

  const promotionIds = entries.filter((e) => e.entity === "promotions").map((e) => e.entity_id);
  const rewardIds = entries.filter((e) => e.entity === "rewards").map((e) => e.entity_id);
  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter((id): id is string => !!id))];

  // Two FKs to profiles on both promotions/rewards (employee_id,
  // approved_by) need an explicit relationship hint, same as their own
  // list pages — reused here, not re-derived.
  const { data: promotionsData } = promotionIds.length
    ? await supabase
        .from("promotions")
        .select(
          "id, employee:profiles!promotions_employee_id_fkey(employee_number,full_name_ar), to_job_title:job_titles!to_job_title_id(name_ar)"
        )
        .in("id", promotionIds)
    : { data: [] };

  const { data: rewardsData } = rewardIds.length
    ? await supabase
        .from("rewards")
        .select(
          "id, employee:profiles!rewards_employee_id_fkey(employee_number,full_name_ar), reward_type, amount"
        )
        .in("id", rewardIds)
    : { data: [] };

  const { data: reviewersData } = actorIds.length
    ? await supabase.from("profiles").select("auth_user_id, employee_number, full_name_ar").in("auth_user_id", actorIds)
    : { data: [] };

  const promotionsById = new Map(
    (promotionsData ?? []).map((p) => [
      p.id,
      p as unknown as {
        id: string;
        employee: { employee_number: string; full_name_ar: string } | null;
        to_job_title: { name_ar: string } | null;
      },
    ])
  );
  const rewardsById = new Map(
    (rewardsData ?? []).map((r) => [
      r.id,
      r as unknown as {
        id: string;
        employee: { employee_number: string; full_name_ar: string } | null;
        reward_type: string;
        amount: number | null;
      },
    ])
  );
  const reviewersByAuthId = new Map(
    (reviewersData ?? []).map((r) => [r.auth_user_id as string, r])
  );

  const statusLabel = (status: string | undefined) => status ?? "—";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {entries.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnDate")}</th>
                  <th>{t("columnType")}</th>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnDetails")}</th>
                  <th>{t("columnDecision")}</th>
                  <th>{t("columnReviewer")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const promotion = entry.entity === "promotions" ? promotionsById.get(entry.entity_id) : undefined;
                  const reward = entry.entity === "rewards" ? rewardsById.get(entry.entity_id) : undefined;
                  const employee = promotion?.employee ?? reward?.employee ?? null;
                  const reviewer = entry.actor_id ? reviewersByAuthId.get(entry.actor_id) : undefined;

                  return (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString("ar-SA", { timeZone: displayTimezone })}</td>
                      <td>{entry.entity === "promotions" ? t("typePromotion") : t("typeReward")}</td>
                      <td>
                        {employee ? `${employee.employee_number} — ${employee.full_name_ar}` : "—"}
                      </td>
                      <td>
                        {promotion
                          ? (promotion.to_job_title?.name_ar ?? "—")
                          : reward
                            ? `${reward.reward_type}${reward.amount != null ? ` (${reward.amount})` : ""}`
                            : "—"}
                      </td>
                      <td>
                        {statusLabel(entry.before_data?.status)} {t("arrow")} {statusLabel(entry.after_data?.status)}
                      </td>
                      <td>
                        {reviewer ? `${reviewer.employee_number} — ${reviewer.full_name_ar}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
