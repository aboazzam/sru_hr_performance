import type { CareerPathEdge } from "@/lib/careerPathTree";

export interface CareerPathTrackRoot {
  jobTitleId: string;
  nameAr: string;
  gradeLevel: number;
}

/**
 * The project owner rejected the previous flat "from -> to" table view
 * (screenshot: every career_path row shown as its own line, with no sense
 * of which rows belong to the same specialty ladder) and asked for named
 * "مسارات" (tracks) instead: click a track name, see a timeline of every
 * reachable job, click a job to see its own requirements.
 *
 * A "track" is defined here as one entry point into the career_path graph
 * -- a job title that never appears on the receiving (`to`) side of any
 * edge, i.e. nothing promotes INTO it. This matches how the real data was
 * actually built (each specialty's own ladder chained together one grade
 * at a time across several migrations, e.g. "مدرب مركز اتصال" -> "قائد
 * فريق خدمة العملاء" -> ...) -- every genuine ladder has exactly one such
 * starting point, so grouping by entry point reconstructs the intended
 * per-specialty tracks without needing a dedicated "track" column that
 * doesn't exist in the schema. `buildForwardCareerTree` (already built for
 * the self-scoped employee view) then walks forward from each root,
 * correctly handling the real fan-out/fan-in cases already present in this
 * data instead of forcing a strictly linear sequence.
 */
export function findCareerPathTrackRoots(
  edges: CareerPathEdge[],
  jobTitleInfo: Map<string, { nameAr: string; gradeLevel: number }>
): CareerPathTrackRoot[] {
  const hasIncoming = new Set(edges.map((e) => e.toJobTitleId));
  const rootIds = new Set<string>();
  for (const edge of edges) {
    if (!hasIncoming.has(edge.fromJobTitleId)) rootIds.add(edge.fromJobTitleId);
  }

  return [...rootIds]
    .map((jobTitleId) => {
      const info = jobTitleInfo.get(jobTitleId);
      return info ? { jobTitleId, nameAr: info.nameAr, gradeLevel: info.gradeLevel } : null;
    })
    .filter((r): r is CareerPathTrackRoot => r !== null)
    .sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}
