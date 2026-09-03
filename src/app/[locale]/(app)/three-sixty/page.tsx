import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Plus, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ThreeSixtyCycleRow } from "@/components/ThreeSixtyCycleRow";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { ThreeSixtyCycleStatus } from "@/lib/threeSixty";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function ThreeSixtyCyclesPage() {
  const t = await getTranslations("ThreeSixtyCyclesPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [
      row.process_area,
      row.vpra_level,
    ])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  // Mirrors three_sixty_cycles_insert/update's own RLS bar
  // (check_vpra_global('threeSixty','prepare')). Hiding the controls here is
  // presentation only; Postgres stays the real gate.
  const canManage = hasVpraAccess(permissions.threeSixty ?? "none", "prepare");

  // three_sixty_cycles_select is USING(true) -- open to every authenticated
  // user, since a rater/nominee legitimately needs to see basic cycle
  // metadata (name/dates/status) to use the self-service screens. Nothing
  // sensitive is read here.
  const { data } = await supabase
    .from("three_sixty_cycles")
    .select("id, cycle_code, name_ar, start_date, end_date, status")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const cycles = (data ?? []) as Array<{
    id: string;
    cycle_code: string;
    name_ar: string;
    start_date: string;
    end_date: string;
    status: ThreeSixtyCycleStatus;
  }>;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty" />
      <div
        className="no-print"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {canManage && (
          <div className="sru-actionbar no-print">
            <Link href="/three-sixty/template" className="sru-btn">
              <Layers size={15} aria-hidden style={{ marginInlineEnd: 6 }} />
              {t("templateButton")}
            </Link>
            <Link href="/three-sixty/new" className="sru-btn sru-btn-primary">
              <Plus size={15} aria-hidden style={{ marginInlineEnd: 6 }} />
              {t("newCycleButton")}
            </Link>
          </div>
        )}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {cycles.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnCode")}</th>
                  <th>{t("columnStartDate")}</th>
                  <th>{t("columnEndDate")}</th>
                  <th>{t("columnStatus")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <ThreeSixtyCycleRow
                    key={cycle.id}
                    cycle={{
                      id: cycle.id,
                      cycleCode: cycle.cycle_code,
                      nameAr: cycle.name_ar,
                      startDate: cycle.start_date,
                      endDate: cycle.end_date,
                      status: cycle.status,
                    }}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
