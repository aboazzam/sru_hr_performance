import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { UserActivityRangeFields } from "@/components/UserActivityRangeFields";

type Period = "day" | "week" | "custom";

function resolvePeriod(period: string | undefined, from: string | undefined, to: string | undefined) {
  const now = new Date();
  const end = now;
  if (period === "day") {
    return { period: "day" as Period, start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end };
  }
  if (period === "custom") {
    const parsedFrom = from ? new Date(from) : null;
    const parsedTo = to ? new Date(to) : null;
    const start = parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const customEnd = parsedTo && !Number.isNaN(parsedTo.getTime()) ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000 - 1) : end;
    return { period: "custom" as Period, start, end: customEnd };
  }
  return { period: "week" as Period, start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end };
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// New tab requested 2026-07-25 ("أنشطة المستخدمين... عدد المستخدمين الحاليين
// واحصائيات عن استخدام المستخدمين خلال يوم او اسبوع او اي مدة"). Gated at
// `userManagement>=approve` (not `view`, unlike this group's other tabs) --
// per-user login timestamps are more sensitive than most administration
// data, confirmed as the right tier when this was proposed and approved.
//
// Real gap found and fixed alongside this page: nothing in this codebase
// ever wrote a `login` audit_log row despite CLAUDE.md §5-A rule 5.1
// requiring it (see login/actions.ts) -- so "login events in a period" only
// has real data from the moment that fix shipped, flagged plainly in the
// UI rather than implied to be complete history. The "active in period"
// metric is different and genuinely retroactive: Supabase tracks
// `auth.users.last_sign_in_at` natively for every account regardless of
// this app's own logging, so it reflects real prior logins already.
export default async function UserActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { period: periodParam, from, to } = await searchParams;
  const t = await getTranslations("UserActivityPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const userManagementLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "userManagement"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(userManagementLevel, "approve");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="administration" current="admin/user-activity" />
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { period, start, end } = resolvePeriod(periodParam, from, to);

  // Every read below uses the service-role client, not the caller's own
  // RLS-respecting one. auth.users isn't exposed via PostgREST at all (so
  // last_sign_in_at genuinely requires the Admin API), and the `canView`
  // VPRA check above (in application code) is what actually gates this
  // page -- matching the established pattern for every other service-role
  // read in this app (invites, role assignment). The profiles read
  // deliberately joined this group too after a real bug found live: reading
  // it via the RLS-respecting client silently scoped "current users" to
  // whatever `employeeData` visibility the viewer happened to hold -- an
  // unrelated permission from the `userManagement>=approve` gate already
  // enforced above, and a real hr_admin/super_admin holding both grants
  // would never have noticed the undercount.
  const admin = createAdminClient();

  // 2026-07-26: last-sign-in was rendering in the server's own timezone
  // (UK) instead of Saudi Arabia time -- read via the caller's own
  // RLS-respecting client (not `admin`), so this genuinely reflects the
  // real `systemSettings` permission boundary rather than always
  // succeeding just because this page already uses a service-role client
  // for its other reads.
  const displayTimezone = await getDisplayTimezone(supabase);

  const { data: profilesData } = await admin
    .from("profiles")
    .select("id, employee_number, full_name_ar, auth_user_id")
    .is("deleted_at", null)
    .not("auth_user_id", "is", null)
    .order("full_name_ar");
  const linkedProfiles = (profilesData ?? []) as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    auth_user_id: string;
  }>;

  const lastSignInByAuthId = new Map<string, string | null>();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data: usersPage, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !usersPage) break;
    for (const u of usersPage.users) lastSignInByAuthId.set(u.id, u.last_sign_in_at ?? null);
    if (usersPage.users.length < perPage) break;
    page += 1;
  }

  const roster = linkedProfiles
    .map((p) => ({ ...p, lastSignInAt: lastSignInByAuthId.get(p.auth_user_id) ?? null }))
    .sort((a, b) => {
      if (!a.lastSignInAt && !b.lastSignInAt) return 0;
      if (!a.lastSignInAt) return 1;
      if (!b.lastSignInAt) return -1;
      return new Date(b.lastSignInAt).getTime() - new Date(a.lastSignInAt).getTime();
    });

  const activeInPeriod = roster.filter((r) => r.lastSignInAt && new Date(r.lastSignInAt) >= start && new Date(r.lastSignInAt) <= end);

  const { data: loginEventsData } = await admin
    .from("audit_log")
    .select("actor_id")
    .eq("action", "login")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  const loginEvents = (loginEventsData ?? []) as Array<{ actor_id: string | null }>;
  const distinctLoginActors = new Set(loginEvents.filter((e) => e.actor_id).map((e) => e.actor_id));

  const cardStyle: React.CSSProperties = { padding: 16, minWidth: 200 };
  const numberStyle: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: "var(--sru-purple)" };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--sru-muted)" };

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/user-activity" />
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <form method="get" className="no-print" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t("periodLabel")}</label>
          <select name="period" defaultValue={period} style={{ padding: "8px 10px", borderRadius: "var(--sru-radius)", border: "1px solid var(--sru-border)" }}>
            <option value="day">{t("periodDay")}</option>
            <option value="week">{t("periodWeek")}</option>
            <option value="custom">{t("periodCustom")}</option>
          </select>
        </div>
        {/* Day / month-name / year, like every other date field in the app.
            The control submits through its own hidden inputs, so this plain
            GET form keeps sending the same `from`/`to` params as before. */}
        <UserActivityRangeFields
          defaultFrom={from ?? toDateInputValue(start)}
          defaultTo={to ?? toDateInputValue(end)}
        />
        <button type="submit" className="sru-btn sru-btn-primary">
          {t("applyButton")}
        </button>
        <p style={{ fontSize: 11.5, color: "var(--sru-muted)", width: "100%", margin: 0 }}>{t("customRangeNote")}</p>
      </form>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{roster.length}</div>
          <div style={labelStyle}>{t("currentUsersLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>
            {activeInPeriod.length}/{roster.length}
          </div>
          <div style={labelStyle}>{t("activeInPeriodLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{loginEvents.length}</div>
          <div style={labelStyle}>{t("loginEventsLabel", { users: distinctLoginActors.size })}</div>
        </div>
      </div>

      <div className="sru-card" style={{ padding: 16, marginBottom: 32, background: "var(--sru-purple-light)" }}>
        <p style={{ fontSize: 13, color: "var(--sru-ink)" }}>{t("loginTrackingNote")}</p>
      </div>

      <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
        {t("tableHeading")}
      </h2>
      <div className="sru-card">
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>{t("colEmployeeNumber")}</th>
                <th>{t("colName")}</th>
                <th>{t("colLastSignIn")}</th>
                <th>{t("colActive")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const isActive = !!r.lastSignInAt && new Date(r.lastSignInAt) >= start && new Date(r.lastSignInAt) <= end;
                return (
                  <tr key={r.id}>
                    <td>{r.employee_number}</td>
                    <td>{r.full_name_ar}</td>
                    <td>{r.lastSignInAt ? new Date(r.lastSignInAt).toLocaleString("ar-SA", { timeZone: displayTimezone }) : t("neverSignedIn")}</td>
                    <td>{isActive ? t("activeYes") : t("activeNo")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
