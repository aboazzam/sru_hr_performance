import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Feedback360Form } from "@/components/Feedback360Form";
import { GroupTabs } from "@/components/layout/GroupTabs";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function Feedback360Page() {
  const t = await getTranslations("Feedback360Page");
  const supabase = await createClient();

  // Same convention as AssignGoalPage: profiles_select requires
  // check_vpra('employeeData','view', org_unit_id) (or self) — a plain
  // `employee` role holds no employeeData grant at all today, so they'll
  // see only themselves here (self-row bypass) and can still submit
  // 'self' feedback, but not pick a colleague as a target. Widening that
  // is a role_permissions matrix decision, not something this screen
  // changes. feedback_360_insert itself has no VPRA gate — this list is
  // only a practical "who can I pick" UI aid, not the real authorization
  // boundary.
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar")
    .is("deleted_at", null)
    .order("employee_number");

  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="evaluationMethods" current="feedback-360" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 && myProfile ? (
        <Feedback360Form employees={employees} cycles={cycles ?? []} myProfileId={myProfile.id} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
