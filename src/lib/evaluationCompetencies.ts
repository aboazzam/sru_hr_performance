import type { SupabaseClient } from "@supabase/supabase-js";
import type { BehavioralLevel } from "@/lib/data/competencies";

export type ScorableCompetency = {
  id: string;
  nameAr: string;
  requiredLevel: BehavioralLevel | null;
};

export type EvaluationCompetenciesResolution = {
  source: "job_title" | "framework";
  jobTitleNameAr: string | null;
  competencies: ScorableCompetency[];
};

/**
 * Resolves which competencies belong on an employee's evaluation.
 *
 * Uses the competencies explicitly assigned to the employee's own job title
 * via `job_title_competencies` (set by a manager on the Career Path screen,
 * each carrying its own required level) instead of the full ~27-competency
 * framework this screen (and the evaluation detail page's "الجدارات" tab)
 * showed before 2026-08-31 — the mismatch a reviewer reported live (the
 * framework competencies bore no relation to what the employee's own job
 * title actually required).
 *
 * Falls back to the full framework (no required level) when the employee
 * has no `job_title_id`, or that job title has no assigned competencies yet
 * — confirmed with the project owner: never leave the screen empty just
 * because a job title hasn't been configured on Career Path.
 *
 * `extraCompetencyIds` (already-scored competencies not in the resolved
 * set — e.g. scored back when this screen showed the full framework, or
 * before a job title's own competency set was edited) are always included
 * too, so a previously entered score is never silently hidden or made
 * permanently unclearable.
 */
export async function resolveEvaluationCompetencies(
  supabase: SupabaseClient,
  employeeId: string,
  extraCompetencyIds: string[] = []
): Promise<EvaluationCompetenciesResolution> {
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

  let assigned: ScorableCompetency[] = [];
  if (jobTitleId) {
    const { data: assignedData } = await supabase
      .from("job_title_competencies")
      .select("competency_id, required_level, competencies(name_ar)")
      .eq("job_title_id", jobTitleId)
      .is("deleted_at", null);

    assigned = (
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

  const source: "job_title" | "framework" = assigned.length > 0 ? "job_title" : "framework";
  const base = assigned.length > 0 ? assigned : allCompetencies;
  const baseIds = new Set(base.map((c) => c.id));

  const extras = extraCompetencyIds
    .filter((id) => !baseIds.has(id))
    .map((id) => byId.get(id))
    .filter((c): c is ScorableCompetency => Boolean(c));

  const competencies = [...base, ...extras].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));

  return { source, jobTitleNameAr, competencies };
}
