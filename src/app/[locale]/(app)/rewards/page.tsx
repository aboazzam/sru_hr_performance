import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { RewardReviewActions } from "@/components/RewardReviewActions";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// This route existed in NavBar already (pointing at /rewards, added
// alongside this screen) but had no page behind it — same "schema is a
// prerequisite" situation as calibration/promotions before their UIs.
export default async function RewardsPage() {
  const t = await getTranslations("RewardsPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (rewards_select: self-row OR
  // check_vpra('promotions','view', employee's org_unit_id) — rewards
  // reuses the 'promotions' process area since CLAUDE.md documents no
  // dedicated one). `rewards` has TWO FKs to profiles (employee_id,
  // approved_by), same ambiguity as promotions — needs an explicit
  // relationship hint. Verified this exact query shape against the REST
  // API with a real temporary row before writing it.
  const { data } = await supabase
    .from("rewards")
    .select(
      "id, reward_type, amount, status, employee:profiles!rewards_employee_id_fkey(employee_number,full_name_ar), evaluation_cycles(name_ar)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rewards = data as unknown as Array<{
    id: string;
    reward_type: string;
    amount: number | null;
    status: string;
    employee: { employee_number: string; full_name_ar: string } | null;
    evaluation_cycles: { name_ar: string } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <div className="sru-actionbar no-print">
          <Link href="/promotions/history" className="sru-btn sru-btn-primary">
            {t("approvalHistory")}
          </Link>
          <Link href="/rewards/new" className="sru-btn sru-btn-primary">
            {t("newReward")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!rewards || rewards.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnType")}</th>
                  <th>{t("columnAmount")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((reward) => (
                  <tr key={reward.id}>
                    <td>
                      {reward.employee?.employee_number} — {reward.employee?.full_name_ar}
                    </td>
                    <td>{reward.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>{reward.reward_type}</td>
                    <td>{reward.amount != null ? reward.amount : "—"}</td>
                    <td>{reward.status}</td>
                    <td>
                      {reward.status === "pending" && (
                        <RewardReviewActions rewardId={reward.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
