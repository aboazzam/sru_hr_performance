import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { type ActivityView } from "@/components/InitiativeActivitiesEditor";
import { InitiativeActivityAdd, InitiativeActivityRowActions } from "@/components/InitiativeActivityActions";
import { InitiativeCardEditor } from "@/components/InitiativeCardEditor";
import { WEEKS_PER_MONTH, coversWeek, groupByYear, timelineFor } from "@/lib/initiativeTimeline";
import { formatDateDmy, todayInTimezone } from "@/lib/dateParts";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { initiativeProgress } from "@/lib/initiativeProgress";
import { InitiativeProgressRing } from "@/components/InitiativeProgressRing";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { missingInitiativeFields, type InitiativeFieldKey } from "@/lib/initiativeCompleteness";
import { AlertCircle } from "lucide-react";
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
/** Same mapping the editor uses for its own inline marks. */
const missingFieldLabelKeys: Record<InitiativeFieldKey, string> = {
  code: "codeLabel",
  horizon: "horizonLabel",
  titleAr: "titleArLabel",
  titleEn: "titleEnLabel",
  deliverableAr: "deliverableLabel",
  subGoalId: "subGoalLabel",
  ownerOrgUnitId: "ownerLabel",
  budgetNote: "budgetLabel",
  statusCode: "statusLabel",
  startDate: "startDateLabel",
  endDate: "endDateLabel",
};

export default async function InitiativePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: Locale }>;
  // `?edit=1` arrives from the pencil beside the initiative in the list, so
  // the editor opens on landing instead of asking for a second click.
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id, locale } = await params;
  const { edit } = await searchParams;
  const t = await getTranslations("InitiativePage");
  const supabase = await createClient();

  const { data: initiative } = await supabase
    .from("strategic_initiatives")
    .select(
      "id, plan_id, title_ar, title_en, code, deliverable_ar, description_ar, sub_goal_id, owner_org_unit_id, horizon, budget_note, status_code, start_date, end_date, progress_percent, perspective_code, outcomes_ar"
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

  // The card editor's own options, fetched only for a caller who can save:
  // strategic_initiatives_update requires strategicPlanning='approve', so
  // anyone below that would be shown a form the database would refuse.
  const canEditCard = hasVpraAccess(level, "approve");
  const missingFields = missingInitiativeFields({
    code: initiative.code,
    horizon: initiative.horizon,
    titleAr: initiative.title_ar,
    titleEn: initiative.title_en,
    deliverableAr: initiative.deliverable_ar,
    subGoalId: initiative.sub_goal_id,
    ownerOrgUnitId: initiative.owner_org_unit_id,
    budgetNote: initiative.budget_note,
    statusCode: initiative.status_code,
    startDate: initiative.start_date,
    endDate: initiative.end_date,
  });
  const { data: planSubGoalRows } = canEditCard
    ? await supabase
        .from("sub_goals")
        .select("id, title_ar, strategic_goal_id, strategic_goals!inner(plan_id)")
        .eq("strategic_goals.plan_id", initiative.plan_id)
        .is("deleted_at", null)
        .order("title_ar")
    : { data: [] };
  const cardSubGoalOptions = ((planSubGoalRows ?? []) as Array<{ id: string; title_ar: string }>).map((sg) => ({
    id: sg.id,
    title: sg.title_ar,
  }));
  const { data: allOrgUnitRows } = canEditCard
    ? await supabase.from("org_units").select("id, name_ar").is("deleted_at", null).order("name_ar")
    : { data: [] };
  const cardOrgUnitOptions = ((allOrgUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => ({
    id: u.id,
    name: u.name_ar,
  }));
  const { data: allStatusRows } = canEditCard
    ? await supabase.from("initiative_statuses").select("code, label_ar").order("display_order")
    : { data: [] };
  const cardStatusOptions = ((allStatusRows ?? []) as Array<{ code: string; label_ar: string }>).map((r) => ({
    code: r.code,
    label: r.label_ar,
  }));

  // The balanced-scorecard strip across the top of the real cards, and the
  // "التبعية مع المبادرات الاخرى" list beneath them (20260820000009).
  const displayTimezone = await getDisplayTimezone(supabase);

  const { data: perspectiveRows } = await supabase
    .from("initiative_perspectives")
    .select("code, label_ar")
    .eq("is_active", true)
    .order("display_order");
  const perspectives = ((perspectiveRows ?? []) as Array<{ code: string; label_ar: string }>).map((r) => ({
    code: r.code,
    label: r.label_ar,
  }));

  const { data: dependencyRows } = await supabase
    .from("initiative_dependencies")
    .select("id, depends_on_initiative_id")
    .eq("initiative_id", id)
    .is("deleted_at", null);
  const dependencyIds = ((dependencyRows ?? []) as Array<{ id: string; depends_on_initiative_id: string }>).map(
    (r) => r.depends_on_initiative_id
  );
  const { data: dependencyInitiatives } =
    dependencyIds.length > 0
      ? await supabase.from("strategic_initiatives").select("id, code, title_ar").in("id", dependencyIds)
      : { data: [] };
  const dependencies = ((dependencyRows ?? []) as Array<{ id: string; depends_on_initiative_id: string }>).map((row) => {
    const target = ((dependencyInitiatives ?? []) as Array<{ id: string; code: string | null; title_ar: string }>).find(
      (i) => i.id === row.depends_on_initiative_id
    );
    return {
      id: row.id,
      initiativeId: row.depends_on_initiative_id,
      code: target?.code ?? null,
      // A dependency whose target this reader cannot see is still real: it is
      // named "—" rather than dropped, so the count never silently shrinks.
      title: target?.title_ar ?? "—",
    };
  });

  // Other initiatives in the same plan, offered as dependency options.
  const { data: siblingRows } = canEditCard
    ? await supabase
        .from("strategic_initiatives")
        .select("id, code, title_ar")
        .eq("plan_id", initiative.plan_id)
        .neq("id", id)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };
  const siblingOptions = ((siblingRows ?? []) as Array<{ id: string; code: string | null; title_ar: string }>).map((i) => ({
    id: i.id,
    label: i.code ? `${i.code} — ${i.title_ar}` : i.title_ar,
  }));

  // One outcome per line (20260820000009) — the bullets on the printed card.
  const outcomesRaw = (initiative.outcomes_ar as string | null) ?? "";
  const outcomes = outcomesRaw
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean);

  const progress = initiativeProgress(
    {
      progressPercent: initiative.progress_percent,
      startDate: initiative.start_date,
      endDate: initiative.end_date,
      statusCode: initiative.status_code,
    },
    todayInTimezone(displayTimezone)
  );

  const cell = (label: string, value: string) => (
    <div style={{ display: "flex", gap: 6, fontSize: 13 }}>
      <span style={{ color: "var(--sru-muted)", whiteSpace: "nowrap" }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      {/* Same action bar as the plan screens, so the buttons here read the
          same way rather than each page inventing its own. */}
      <div
        className="sru-actionbar no-print"
        style={{ justifyContent: "space-between", gap: 12, marginBottom: 16 }}
      >
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

      {/* ---- the card, laid out like the real decks: a titled band, then a
           three-column body (identity | definition | goal chain), then the
           outcomes / dependencies pair, then the month strip ---- */}
      <div className="sru-card sru-initiative-sheet">
        <header className="sru-initiative-sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="sru-title" style={{ fontSize: 22 }}>
              {initiative.title_ar}
            </h1>
            {initiative.title_en && (
              <p dir="ltr" style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 2 }}>
                {initiative.title_en}
              </p>
            )}
            {initiative.deliverable_ar && (
              <p className="sru-initiative-sheet-deliverable">{initiative.deliverable_ar}</p>
            )}
          </div>
          <InitiativeProgressRing progress={progress} size={82} />
        </header>

        {/* The balanced-scorecard strip: every perspective is shown, the
            initiative's own one lit — exactly as the printed cards read. */}
        <div className="sru-initiative-perspectives">
          {perspectives.map((p) => (
            <span
              key={p.code}
              className={p.code === initiative.perspective_code ? "sru-perspective is-on" : "sru-perspective"}
            >
              {p.label}
            </span>
          ))}
        </div>

        <div className="sru-initiative-sheet-grid">
          <section className="sru-initiative-block">
            <h2>{t("identityBlock")}</h2>
            {cell(t("codeLabel"), initiative.code ?? "—")}
            {cell(t("statusLabel"), statusRow?.label_ar ?? initiative.status_code)}
            {cell(t("horizonLabel"), initiative.horizon ?? "—")}
            {cell(t("budgetLabel"), initiative.budget_note ?? "—")}
            {cell(t("startDateLabel"), initiative.start_date ? formatDateDmy(initiative.start_date, locale) : t("tbd"))}
            {cell(t("endDateLabel"), initiative.end_date ? formatDateDmy(initiative.end_date, locale) : t("tbd"))}
          </section>

          <section className="sru-initiative-block is-wide">
            <h2>{t("definitionLabel")}</h2>
            {initiative.description_ar ? (
              <p style={{ fontSize: 13, lineHeight: 1.9 }}>{initiative.description_ar}</p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>—</p>
            )}
          </section>

          <section className="sru-initiative-block">
            <h2>{t("goalChainBlock")}</h2>
            {cell(t("mainGoalLabel"), goal?.title_ar ?? "—")}
            {cell(t("subGoalLabel"), subGoal?.title_ar ?? "—")}
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
          </section>

          <section className="sru-initiative-block">
            <h2>{t("outcomesLabel")}</h2>
            {outcomes.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>—</p>
            ) : (
              <ul className="sru-initiative-outcomes">
                {outcomes.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="sru-initiative-block">
            <h2>{t("dependenciesLabel")}</h2>
            {dependencies.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--sru-muted)" }}>—</p>
            ) : (
              <ul className="sru-initiative-outcomes">
                {dependencies.map((d) => (
                  <li key={d.id}>
                    {d.code ? <span className="sru-en" style={{ fontWeight: 700 }}>{d.code} </span> : null}
                    <Link href={`/initiatives/${d.initiativeId}`} style={{ color: "inherit" }}>
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ---- month strip: أبرز الأنشطة × الأشهر ---- */}
        <div className="sru-initiative-timeline">
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t("activitiesHeading")}</h2>
            {canEditActivities && (
              <InitiativeActivityAdd initiativeId={initiative.id} employeeOptions={employeeOptions} />
            )}
          </div>
          {activities.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noActivities")}</p>
          ) : (
            <div className="table-scroll">
              <table className="admin-matrix" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th rowSpan={3} style={{ minWidth: 240 }}>
                      {t("activityColumn")}
                    </th>
                    <th rowSpan={3} style={{ minWidth: 120 }}>
                      {t("responsibleColumn")}
                    </th>
                    {canEditActivities && <th rowSpan={3} className="no-print" />}
                    {yearGroups.map((group) => (
                      <th key={group.year} colSpan={group.months.length * WEEKS_PER_MONTH} style={{ textAlign: "center" }}>
                        {group.year}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {months.map((month) => (
                      <th key={month.key} colSpan={WEEKS_PER_MONTH} style={{ textAlign: "center", padding: "2px 4px" }}>
                        M{month.month}
                      </th>
                    ))}
                  </tr>
                  {/* Each month is drawn as four weeks, the same split the
                      real cards use and state on their own footnote. */}
                  <tr>
                    {months.map((month) =>
                      Array.from({ length: WEEKS_PER_MONTH }, (_, week) => (
                        <th
                          key={`${month.key}-w${week}`}
                          style={{ textAlign: "center", padding: "1px 2px", fontSize: 10, fontWeight: 600 }}
                        >
                          {week + 1}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{activity.titleAr}</td>
                      <td>{activity.responsibleLabel}</td>
                      {canEditActivities && (
                        <td className="no-print">
                          <InitiativeActivityRowActions
                            initiativeId={initiative.id}
                            activity={activity}
                            employeeOptions={employeeOptions}
                          />
                        </td>
                      )}
                      {months.map((month) =>
                        Array.from({ length: WEEKS_PER_MONTH }, (_, week) => (
                          <td
                            key={`${month.key}-w${week}`}
                            style={{
                              textAlign: "center",
                              padding: 2,
                              minWidth: 14,
                              background: coversWeek(activity, month, week) ? "var(--sru-purple)" : undefined,
                            }}
                          />
                        ))
                      )}
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

      {/* The editor itself is now behind the pencil, so what is still blank
          is stated here on the page — otherwise collapsing the form would
          also hide the one signal that says the card is incomplete. */}
      {canEditCard && missingFields.length > 0 && (
        <div className="no-print sru-missing-banner">
          <AlertCircle size={16} aria-hidden style={{ flex: "0 0 auto", marginTop: 3 }} />
          <span>
            <strong>{t("missingHeading", { count: missingFields.length })}</strong>{" "}
            {missingFields.map((key) => t(missingFieldLabelKeys[key])).join("، ")}
          </span>
        </div>
      )}

      {canEditCard && (
        <InitiativeCardEditor
          initiativeId={initiative.id}
          initial={{
            code: initiative.code ?? "",
            horizon: initiative.horizon ?? "",
            titleAr: initiative.title_ar ?? "",
            titleEn: initiative.title_en ?? "",
            deliverableAr: initiative.deliverable_ar ?? "",
            descriptionAr: initiative.description_ar ?? "",
            subGoalId: initiative.sub_goal_id ?? "",
            ownerOrgUnitId: initiative.owner_org_unit_id ?? "",
            budgetNote: initiative.budget_note ?? "",
            statusCode: initiative.status_code ?? "",
            startDate: initiative.start_date ?? "",
            endDate: initiative.end_date ?? "",
            progressPercent: initiative.progress_percent == null ? "" : String(initiative.progress_percent),
            perspectiveCode: initiative.perspective_code ?? "",
            outcomesAr: outcomesRaw,
          }}
          subGoalOptions={cardSubGoalOptions}
          orgUnitOptions={cardOrgUnitOptions}
          statusOptions={cardStatusOptions}
          perspectiveOptions={perspectives}
          dependencies={dependencies.map((d) => ({
            id: d.id,
            label: d.code ? d.code + " — " + d.title : d.title,
            // Carried through so the row can offer "open the initiative".
            initiativeId: d.initiativeId,
          }))}
          dependencyOptions={siblingOptions}
          assignments={assignments.map((a) => ({
            orgUnitId: a.org_unit_id,
            orgUnitName: orgUnitNameById.get(a.org_unit_id) ?? "—",
            role: a.role as "lead" | "participant" | "supporter",
            percentage: a.percentage,
          }))}
          openOnMount={edit === "1"}
        />
      )}


    </div>
  );
}
