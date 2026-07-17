import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EmployeeInviteForm } from "@/components/EmployeeInviteForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EmployeeInvitePage() {
  const t = await getTranslations("EmployeeInvitePage");
  const supabase = await createClient();

  // RLS-scoped to the caller: org_units_select requires
  // check_vpra('employeeData','view', <unit id>) per unit, so this list is
  // already limited to whatever the current user can see — not every org
  // unit necessarily appears here for an org-unit-scoped caller.
  const { data: orgUnits } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .order("name_ar");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {orgUnits && orgUnits.length > 0 ? (
        <EmployeeInviteForm orgUnits={orgUnits} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
