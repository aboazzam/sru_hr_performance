import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CalibrationResultsForm } from "@/components/CalibrationResultsForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function CalibrationSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("CalibrationSessionDetailPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (calibration_sessions_select:
  // check_vpra('calibration','view', org_unit_id)) — a missing row and an
  // RLS-blocked row look identical here on purpose, same reasoning as the
  // evaluation detail page.
  const { data: session } = await supabase
    .from("calibration_sessions")
    .select("id, org_unit_id, status, evaluation_cycles(name_ar), org_units(name_ar)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!session) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const cycle = session.evaluation_cycles as unknown as { name_ar: string } | null;
  const orgUnit = session.org_units as unknown as { name_ar: string } | null;

  // Employees rated in a calibration session are the org unit's own
  // employees (profiles_select requires employeeData=view, which
  // hr_admin/committee both hold — the same roles that can reach this
  // page via calibration=view at all) — not filtered further, no
  // documented rule exists for narrowing this beyond "the session's org
  // unit."
  const { data: employeesData } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar")
    .eq("org_unit_id", session.org_unit_id)
    .is("deleted_at", null)
    .order("employee_number");

  const employees = employeesData ?? [];

  const { data: existingResults } = await supabase
    .from("calibration_results")
    .select("employee_id, original_rating, calibrated_rating, justification")
    .eq("session_id", session.id)
    .is("deleted_at", null);

  const resultsByEmployee = new Map<
    string,
    { original_rating: number | null; calibrated_rating: number | null; justification: string | null }
  >();
  for (const row of existingResults ?? []) {
    resultsByEmployee.set(row.employee_id, {
      original_rating: row.original_rating,
      calibrated_rating: row.calibrated_rating,
      justification: row.justification,
    });
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {cycle?.name_ar ?? "—"} — {orgUnit?.name_ar ?? "—"} — {session.status}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("employeesEmpty")}</p>
      ) : (
        <CalibrationResultsForm
          sessionId={session.id}
          employees={employees.map((e) => ({
            id: e.id,
            employeeNumber: e.employee_number,
            fullNameAr: e.full_name_ar,
            initialOriginalRating: resultsByEmployee.get(e.id)?.original_rating ?? null,
            initialCalibratedRating: resultsByEmployee.get(e.id)?.calibrated_rating ?? null,
            initialJustification: resultsByEmployee.get(e.id)?.justification ?? null,
          }))}
        />
      )}
    </div>
  );
}
