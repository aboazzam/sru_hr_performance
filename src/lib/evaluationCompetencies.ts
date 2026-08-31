import type { SupabaseClient } from "@supabase/supabase-js";
import type { BehavioralLevel } from "@/lib/data/competencies";

export type ScorableCompetency = {
  id: string;
  nameAr: string;
  requiredLevel: BehavioralLevel | null;
};

export type EvaluationCompetenciesResolution = {
  source: "employee" | "job_title" | "framework";
  jobTitleNameAr: string | null;
  competencies: ScorableCompetency[];
};

/**
 * Resolves which competencies belong on an employee's evaluation.
 *
 * Three tiers, most specific first:
 *
 * 1. `employee_competencies` — the manager's own curated record for THIS
 *    employee specifically (migration 20260827000003, built on the
 *    Employees screen's "الجدارات" tab). Deliberately independent of
 *    `job_title_competencies` ("مستقل عن جدارات المسمى الوظيفي المشتركة بين
 *    كل من يحمله" — its own table comment) — a manager can set a level
 *    different from the job title's, or add competencies the job title
 *    doesn't carry at all. When this employee has any such row, it wins
 *    outright rather than being merged with the job-title tier below —
 *    confirmed live (2026-08-31) when a reviewer found a real employee
 *    scored against only 5 job-title competencies while their manager had
 *    curated 13 employee-specific ones that never surfaced anywhere on the
 *    evaluation screens.
 * 2. `job_title_competencies` — the competencies shared by every employee
 *    holding that job title (set on the Career Path screen). Used only
 *    when the employee has no `employee_competencies` rows of their own.
 * 3. The full competency framework (no required level) — used when neither
 *    of the above has anything, so a job title that hasn't been configured
 *    yet never leaves the screen empty (confirmed with the project owner
 *    2026-08-31).
 *
 * `extraCompetencyIds` (already-scored competencies not in the resolved
 * set — e.g. scored under an earlier tier before this employee's record was
 * curated, or before this filtering existed at all) are always included
 * too, so a previously entered score is never silently hidden or made
 * permanently unclearable.
 */
export async function resolveEvaluationCompetencies(
  supabase: SupabaseClient,
  employeeId: string,
  extraCompetencyIds: string[] = []
): Promise<EvaluationCompetenciesResolution> {
  const { data: employeeAssignedData } = await supabase
    .from("employee_competencies")
    .select("competency_id, required_level, competencies(name_ar)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  const employeeAssigned: ScorableCompetency[] = (
    (employeeAssignedData as unknown as Array<{
      competency_id: string;
      required_level: BehavioralLevel;
      competencies: { name_ar: string } | null;
    }> | null) ?? []
  )
    .filter((row) => row.competencies)
    .map((row) => ({
      id: row.competency_id,
      nameAr: row.competencies!.name_ar,
      requiredLevel: row.required_level,
    }));

  const { data: profileData } = await supabase
    .from("profiles")
    .select("job_title_id, job_titles(name_ar)")
    .eq("id", employeeId)
    .maybeSingle();

  const profile = profileData as unknown as {
    job_title_id: string | null;
    job_titles: { name_ar: string } | null;
  } | null;

  const jobTitleId = profile?.job_title_id ?? null;
  const jobTitleNameAr = profile?.job_titles?.name_ar ?? null;

  let jobTitleAssigned: ScorableCompetency[] = [];
  if (employeeAssigned.length === 0 && jobTitleId) {
    const { data: assignedData } = await supabase
      .from("job_title_competencies")
      .select("competency_id, required_level, competencies(name_ar)")
      .eq("job_title_id", jobTitleId)
      .is("deleted_at", null);

    jobTitleAssigned = (
      (assignedData as unknown as Array<{
        competency_id: string;
        required_level: BehavioralLevel;
        competencies: { name_ar: string } | null;
      }> | null) ?? []
    )
      .filter((row) => row.competencies)
      .map((row) => ({
        id: row.competency_id,
        nameAr: row.competencies!.name_ar,
        requiredLevel: row.required_level,
      }));
  }

  const { data: allCompetenciesData } = await supabase
    .from("competencies")
    .select("id, name_ar")
    .is("deleted_at", null);

  const allCompetencies: ScorableCompetency[] = (
    (allCompetenciesData as unknown as Array<{ id: string; name_ar: string }> | null) ?? []
  ).map((c) => ({ id: c.id, nameAr: c.name_ar, requiredLevel: null }));

  const byId = new Map(allCompetencies.map((c) => [c.id, c]));

  const source: "employee" | "job_title" | "framework" =
    employeeAssigned.length > 0 ? "employee" : jobTitleAssigned.length > 0 ? "job_title" : "framework";
  const base = employeeAssigned.length > 0 ? employeeAssigned : jobTitleAssigned.length > 0 ? jobTitleAssigned : allCompetencies;
  const baseIds = new Set(base.map((c) => c.id));

  const extras = extraCompetencyIds
    .filter((id) => !baseIds.has(id))
    .map((id) => byId.get(id))
    .filter((c): c is ScorableCompetency => Boolean(c));

  const competencies = [...base, ...extras].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  return { source, jobTitleNameAr, competencies };
}

/**
 * Which `EvaluationScoresPage`/`EvaluationDetailPage` message key explains a
 * resolution's `source`, and its interpolation params — kept in one place so
 * the two consuming pages can't describe the same `source` differently.
 */
export function describeCompetenciesSource(
  source: EvaluationCompetenciesResolution["source"],
  jobTitleNameAr: string | null
): { key: "competenciesFromEmployee" | "competenciesFromJobTitle" | "competenciesFromFramework"; params?: { jobTitle: string } } {
  if (source === "employee") {
    return { key: "competenciesFromEmployee" };
  }
  if (source === "job_title" && jobTitleNameAr) {
    return { key: "competenciesFromJobTitle", params: { jobTitle: jobTitleNameAr } };
  }
  return { key: "competenciesFromFramework" };
}
