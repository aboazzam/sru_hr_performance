import type { createClient } from "@/lib/supabase/server";
import {
  buildForwardCareerTree,
  collectCareerTreeJobTitleIds,
  type CareerJobTitleInfo,
  type CareerPathEdge,
  type CareerTreeNode,
} from "@/lib/careerPathTree";
import type { BehavioralLevel } from "@/lib/data/competencies";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Fetches career_path (RLS-scoped to the caller, career_path_select:
 * check_vpra_global('careerPath','view')) and walks it forward from
 * `jobTitleId`, then fetches just the job_titles/job_title_competencies
 * rows for the ids that appear in that resulting tree — shared by
 * /profile's career-path tab and /career-path's view-only (non-management)
 * branch so both render an employee's own forward path identically,
 * rather than duplicating this fetch+walk logic in two page files.
 */
export async function getSelfScopedCareerTree(
  supabase: SupabaseServerClient,
  jobTitleId: string
): Promise<{ tree: CareerTreeNode; jobTitleInfo: Map<string, CareerJobTitleInfo> }> {
  const { data: allCareerPathEdges } = await supabase
    .from("career_path")
    .select("id, requirements_ar, from_job_title_id, to_job_title_id")
    .is("deleted_at", null);

  const careerPathEdges: CareerPathEdge[] = (allCareerPathEdges ?? []).map((e) => ({
    id: e.id,
    requirementsAr: e.requirements_ar,
    fromJobTitleId: e.from_job_title_id,
    toJobTitleId: e.to_job_title_id,
  }));

  const tree = buildForwardCareerTree(careerPathEdges, jobTitleId);
  const jobTitleIds = [...collectCareerTreeJobTitleIds(tree)];

  // .is("job_title_competencies.deleted_at", null) filters the EMBEDDED
  // resource specifically (PostgREST's documented child-row filtering) --
  // .is("deleted_at", null) alone only ever applied to the outer job_titles
  // row. Found live: a soft-deleted + re-added requirement for the same
  // (job_title_id, competency_id) pair (from an earlier admin-screen test)
  // was leaking the deleted row back in as a duplicate.
  const { data: careerJobTitlesData } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level, description_ar, job_title_competencies(required_level, competencies(name_ar))")
    .in("id", jobTitleIds)
    .is("deleted_at", null)
    .is("job_title_competencies.deleted_at", null);

  const jobTitleInfo = new Map<string, CareerJobTitleInfo>(
    (
      careerJobTitlesData as unknown as Array<{
        id: string;
        name_ar: string;
        grade_level: number;
        description_ar: string | null;
        job_title_competencies: Array<{ required_level: BehavioralLevel; competencies: { name_ar: string } | null }>;
      }> | null
    )?.map((jt) => [
      jt.id,
      {
        nameAr: jt.name_ar,
        gradeLevel: jt.grade_level,
        descriptionAr: jt.description_ar,
        competencies: jt.job_title_competencies
          .filter((jtc) => jtc.competencies)
          .map((jtc) => ({ nameAr: jtc.competencies!.name_ar, requiredLevel: jtc.required_level })),
      },
    ]) ?? []
  );

  return { tree, jobTitleInfo };
}
