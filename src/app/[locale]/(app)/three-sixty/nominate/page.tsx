import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ThreeSixtyNominateForm } from "@/components/ThreeSixtyNominateForm";

export default async function ThreeSixtyNominatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("ThreeSixtyNominatePage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  const { data: cycle } = await supabase
    .from("three_sixty_cycles")
    .select("id, cycle_code, name_ar, min_raters, max_raters")
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  const { data: raterGroupRows } = await supabase
    .from("three_sixty_rater_groups")
    .select("relationship_code, name_ar, min_raters_in_group, max_raters_in_group, employee_may_nominate, allows_external_rater")
    .eq("employee_may_nominate", true)
    .is("deleted_at", null)
    .order("relationship_code");

  // SECURITY DEFINER -- most seeded roles (employee, employees_coordinator,
  // finance_manager...) hold no employeeData grant at all, so a plain
  // profiles_select query used to return just the caller's own row (excluded
  // right below anyway), leaving this picker empty for almost everyone in
  // production (confirmed live: a real "زميل"/"مستفيد" search returned zero
  // matches). Nominating a rater for yourself needs no elevated permission
  // in the first place (three_sixty_nominations_insert doesn't require any
  // employeeData grant), so this bypass reveals nothing the action itself
  // wasn't already going to allow -- see migration 20260906000001's header.
  const { data: employeeRows } = myProfile ? await supabase.rpc("get_three_sixty_nominatable_employees") : { data: null };
  const employees = employeeRows as { id: string; employee_number: string; full_name_ar: string }[] | null;

  const { data: existing } = cycle && myProfile
    ? await supabase
        .from("three_sixty_nominations")
        .select(
          "id, relationship_code, rater_employee_id, external_rater_name, external_rater_email, status, review_notes, months_worked_together"
        )
        .eq("cycle_id", cycle.id)
        .eq("subject_employee_id", myProfile.id)
        .is("deleted_at", null)
    : { data: null };

  // Once an external nomination is approved, its real 360 assignment (with
  // a real access_token) exists -- resolved here so the form can offer a
  // copyable link. Matched by email since nominations/assignments aren't
  // directly FK'd to each other, only by the shared (cycle, subject,
  // relationship, identity) tuple -- same pattern `assignmentCreation.ts`'s
  // dedupe already uses.
  const externalEmails = (existing ?? []).map((e) => e.external_rater_email).filter((e): e is string => e != null);
  const { data: externalAssignments } =
    cycle && myProfile && externalEmails.length > 0
      ? await supabase
          .from("three_sixty_assignments")
          .select("external_rater_email, access_token")
          .eq("cycle_id", cycle.id)
          .eq("subject_employee_id", myProfile.id)
          .in("external_rater_email", externalEmails)
          .is("deleted_at", null)
      : { data: null };
  const tokenByExternalEmail = new Map((externalAssignments ?? []).map((a) => [a.external_rater_email, a.access_token]));

  // No email provider is wired up yet (2026-09-06 -- confirmed directly,
  // nothing in this project sends arbitrary transactional email) -- whoever
  // nominated the external rater copies this link and sends it manually
  // (WhatsApp, their own email client, ...) until one is. `x-forwarded-*`
  // trusted the same way `forgot-password/actions.ts` already does for its
  // own redirect link.
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (forwardedHost?.startsWith("localhost") ? "http" : "https");
  const origin = forwardedHost ? `${protocol}://${forwardedHost}` : "";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/nominate" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!myProfile ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      ) : !cycle ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoActiveCycle")}</p>
      ) : !raterGroupRows || raterGroupRows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoNominateableGroups")}</p>
      ) : (
        <ThreeSixtyNominateForm
          cycle={{ id: cycle.id, nameAr: cycle.name_ar, minRaters: cycle.min_raters, maxRaters: cycle.max_raters }}
          raterGroups={raterGroupRows.map((g) => ({
            relationshipCode: g.relationship_code,
            nameAr: g.name_ar,
            minRatersInGroup: g.min_raters_in_group,
            maxRatersInGroup: g.max_raters_in_group,
            allowsExternalRater: g.allows_external_rater,
          }))}
          employees={(employees ?? []).map((e) => ({ id: e.id, label: `${e.full_name_ar} (${e.employee_number})` }))}
          existing={(existing ?? []).map((e) => ({
            relationshipCode: e.relationship_code,
            raterEmployeeId: e.rater_employee_id,
            externalRaterName: e.external_rater_name,
            externalRaterEmail: e.external_rater_email,
            externalLink: e.external_rater_email && tokenByExternalEmail.has(e.external_rater_email)
              ? `${origin}/${locale}/three-sixty-external/${tokenByExternalEmail.get(e.external_rater_email)}`
              : null,
            status: e.status,
            reviewNotes: e.review_notes,
            monthsWorkedTogether: e.months_worked_together,
          }))}
        />
      )}
    </div>
  );
}
