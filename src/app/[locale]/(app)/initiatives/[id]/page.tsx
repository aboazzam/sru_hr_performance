import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { InitiativeActivitiesEditor, type ActivityView } from "@/components/InitiativeActivitiesEditor";
import { coversMonth, groupByYear, timelineFor } from "@/lib/initiativeTimeline";
import { formatDateDmy } from "@/lib/dateParts";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { Locale } from "@/i18n/config";

/**
 * صفحة المبادرة — laid out to match the real initiative cards supplied by the
 * project owner, in their order: the deliverable and code, the definition,
 * the main and sub goal, horizon and budget, the owning department, the
 * dates, then the month strip with «أبرز الأنشطة» and «الشخص المسؤول».
 *
 * The card block is what prints (`PrintButton` + the app's existing print
 * rules); the activity editor beneath it carries `no-print`, so paper shows
 * the card exactly as the decks do.
 *
 * Supporting departments come from the assignment slice
 * (initiative_assignments), so «الإدارات الداعمة» is real data, not a second
 * place to type the same thing.
 */
export default async function InitiativePage({ params }: { params: Promise<{ id: string; locale: Locale }> }) {
  const { id, locale } = await params;
  const t = await getTranslations("InitiativePage");
  const supabase = await createClient();

  const { data: initiative } = await supabase
    .from("strategic_initiatives")
    .select(
      "id, plan_id, title_ar, title_en, code, deliverable_ar, description_ar, sub_goal_id, owner_org_unit_id, horizon, budget_note, status_code, start_date, end_date"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!initiative) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";

  // ---- goal chain: الهدف الرئيسي derives from الهدف الفرعي ----
  const { data: subGoal } = initiative.sub_goal_id
    ? await supabase.from("sub_goals").select("id, title_ar, strategic_goal_id").eq("id", initiative.sub_goal_id).maybeSingle()
    : { data: null };
  const { data: goal } = subGoal
    ? await supabase.from("strategic_goals").select("title_ar").eq("id", subGoal.strategic_goal_id).maybeSingle()
    : { data: null };

  const { data: statusRow } = await supabase
    .from("initiative_statuses")
    .select("label_ar")
    .eq("code", initiative.status_code)
    .maybeSingle();

  // ---- owning + supporting departments (from the assignment slice) ----
  const { data: assignmentRows } = await supabase
    .from("initiative_assignments")
    .select("org_unit_id, role, percentage")
    .eq("initiative_id", id)
    .is("deleted_at", null);
  const assignments = (assignmentRows ?? []) as Array<{ org_unit_id: string; role: string; percentage: number | null }>;

  const orgUnitIds = Array.from(
    new Set([...assignments.map((a) => a.org_unit_id), initiative.owner_org_unit_id].filter((v): v is string => Boolean(v)))
  );
  const { data: orgUnitRows } =
    orgUnitIds.length > 0 ? await supabase.from("org_units").select("id, name_ar").in("id", orgUnitIds) : { data: [] };
  const orgUnitNameById = new Map(((orgUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => [u.id, u.name_ar]));

  const ownerName = initiative.owner_org_unit_id ? orgUnitNameById.get(initiative.owner_org_unit_id) ?? null : null;
  const participating = assignments.filter((a) => a.role === "participant");
  const supporting = assignments.filter((a) => a.role === "supporter");

  // ---- activities ----
  const { data: activityRows } = await supabase
    .from("initiative_activities")
    .select("id, title_ar, responsible_profile_id, responsible_name, start_date, end_date, display_order")
    .eq("initiative_id", id)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  const rawActivities = (activityRows ?? []) as Array<{
    id: string;
    title_ar: string;
    responsible_profile_id: string | null;
    responsible_name: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;

  const responsibleIds = Array.from(
    new Set(rawActivities.map((a) => a.responsible_profile_id).filter((v): v is string => Boolean(v)))
  );
  const { data: responsibleProfiles } =
    responsibleIds.length > 0
      ? await supabase.from("profiles").select("id, full_name_ar").in("id", responsibleIds)
      : { data: [] };
  const profileNameById = new Map(
    ((responsibleProfiles ?? []) as Array<{ id: string; full_name_ar: string }>).map((p) => [p.id, p.full_name_ar])
  );

  const activities: ActivityView[] = rawActivities.map((a) => ({
    id: a.id,
    titleAr: a.title_ar,
    responsibleProfileId: a.responsible_profile_id,
    responsibleName: a.responsible_name,
    responsibleLabel:
      a.responsible_name ??
      (a.responsible_profile_id ? profileNameById.get(a.responsible_profile_id) ?? t("responsibleUnknown") : t("responsibleNone")),
    startDate: a.start_date,
    endDate: a.end_date,
  }));

  const months = timelineFor({ startDate: initiative.start_date, endDate: initiative.end_date }, activities);
  const yearGroups = groupByYear(months);

  // Who can maintain the activity list: planners, or the owning department's
  // own staff — the same rule initiative_activities' RLS enforces, so the
  // editor is not shown to someone the database would refuse.
  const { data: myProfile } = await supabase.from("profiles").select("org_unit_id").maybeSingle();
  const canEditActivities =
    hasVpraAccess(level, "approve") ||
    (initiative.owner_org_unit_id != null && myProfile?.org_unit_id === initiative.owner_org_unit_id);

  const { data: employeeRows } = canEditActivities
    ? await supabase.from("profiles").select("id, employee_number, full_name_ar").is("deleted_at", null).order("employee_number")
    : { data: [] };
  const employeeOptions = ((employeeRows ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map((e) => ({
    id: e.id,
    label: `${e.employee_number} — ${e.full_name_ar}`,
  }));

  const cell = (label: string, value: string) => (
    <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
      <span style={{ color: "var(--sru-muted)", whiteSpace: "nowrap" }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Link
          href={`/kpis/plans/${initiative.plan_id}`}
          className="sru-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
        >
          <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
          {t("backToPlan")}
        </Link>
        <PrintButton />
      </div>

      {/* ---- the card, in the order the real decks use ---- */}
      <div className="sru-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className="sru-title" style={{ fontSize: 22 }}>
              {initiative.title_ar}
            </h1>
            {initiative.title_en && (
              <p dir="ltr" style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 2 }}>
                {initiative.title_en}
              </p>
            )}
            {initiative.deliverable_ar && (
              <p style={{ fontSize: 14, marginTop: 8, fontWeight: 700 }}>• {initiative.deliverable_ar}</p>
            )}
          </div>
          <div style={{ textAlign: "start" }}>
            {cell(t("codeLabel"), initiative.code ?? "—")}
            {cell(t("statusLabel"), statusRow?.label_ar ?? initiative.status_code)}
          </div>
        </div>

        {initiative.description_ar && (
          <div style={{ marginTop: 14 }}>
            <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("definitionLabel")}</span>
            <p style={{ fontSize: 13, lineHeight: 1.9, marginTop: 4 }}>{initiative.description_ar}</p>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
            borderTop: "1px solid var(--sru-border, #e5e7eb)",
            paddingTop: 14,
          }}
        >
          {cell(t("mainGoalLabel"), goal?.title_ar ?? "—")}
          {cell(t("subGoalLabel"), subGoal?.title_ar ?? "—")}
          {cell(t("horizonLabel"), initiative.horizon ?? "—")}
          {cell(t("budgetLabel"), initiative.budget_note ?? "—")}
          {cell(t("ownerLabel"), ownerName ?? "—")}
          {cell(
            t("participatingLabel"),
            participating.length > 0
              ? participating.map((a) => `${orgUnitNameById.get(a.org_unit_id) ?? "—"} (${a.percentage}%)`).join("، ")
              : "—"
          )}
          {cell(
            t("supportingLabel"),
            supporting.length > 0 ? supporting.map((a) => orgUnitNameById.get(a.org_unit_id) ?? "—").join("، ") : "—"
          )}
          {cell(t("startDateLabel"), initiative.start_date ? formatDateDmy(initiative.start_date, locale) : t("tbd"))}
          {cell(t("endDateLabel"), initiative.end_date ? formatDateDmy(initiative.end_date, locale) : t("tbd"))}
        </div>

        {/* ---- month strip: أبرز الأنشطة × الأشهر ---- */}
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t("activitiesHeading")}</h2>
          {activities.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noActivities")}</p>
          ) : (
            <div className="table-scroll">
              <table className="admin-matrix" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ minWidth: 240 }}>
                      {t("activityColumn")}
                    </th>
                    <th rowSpan={2} style={{ minWidth: 120 }}>
                      {t("responsibleColumn")}
                    </th>
                    {yearGroups.map((group) => (
                      <th key={group.year} colSpan={group.months.length} style={{ textAlign: "center" }}>
                        {group.year}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {months.map((month) => (
                      <th key={month.key} style={{ textAlign: "center", padding: "2px 4px" }}>
                        M{month.month}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{activity.titleAr}</td>
                      <td>{activity.responsibleLabel}</td>
                      {months.map((month) => (
                        <td
                          key={month.key}
                          style={{
                            textAlign: "center",
                            padding: 2,
                            background: coversMonth(activity, month) ? "var(--sru-purple)" : undefined,
                          }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activities.length > 0 && months.length === 0 && (
            <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 8 }}>{t("noTimeline")}</p>
          )}
        </div>
      </div>

      {canEditActivities && (
        <InitiativeActivitiesEditor initiativeId={initiative.id} activities={activities} employeeOptions={employeeOptions} />
      )}
    </div>
  );
}
