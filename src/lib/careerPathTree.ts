import type { BehavioralLevel } from "@/lib/data/competencies";

export interface CareerPathEdge {
  id: string;
  requirementsAr: string | null;
  fromJobTitleId: string;
  toJobTitleId: string;
}

/** Shared shape for a job title's own description + required competencies, keyed by job_title_id. */
export interface CareerJobTitleInfo {
  nameAr: string;
  gradeLevel: number;
  descriptionAr: string | null;
  competencies: Array<{ nameAr: string; requiredLevel: BehavioralLevel }>;
}

export interface CareerTreeNode {
  jobTitleId: string;
  /** Requirements to advance into this node (the edge leading to it); null for the root. */
  requirementsAr: string | null;
  children: CareerTreeNode[];
}

/**
 * Walks `career_path` edges forward from an employee's own job title,
 * collecting every reachable future job as a tree (branches when a job
 * leads to more than one next step, per the real data — e.g. one grade-10
 * role fanning out to two distinct grade-11 targets). The root itself is
 * included (requirementsAr: null) so callers can render "current job" +
 * "future path" from one structure — the profile page renders the root
 * separately and only the children as the forward path, per the project
 * owner's "متى مساره القادم فقط" (his upcoming path only) instruction.
 *
 * A visited-set guard prevents infinite recursion if a cycle were ever
 * introduced (career_path only blocks a direct A->A self-loop at the DB
 * level, not longer cycles) — defensive, not expected with real data.
 */
export function buildForwardCareerTree(edges: CareerPathEdge[], rootJobTitleId: string): CareerTreeNode {
  const byFrom = new Map<string, CareerPathEdge[]>();
  for (const edge of edges) {
    const list = byFrom.get(edge.fromJobTitleId);
    if (list) list.push(edge);
    else byFrom.set(edge.fromJobTitleId, [edge]);
  }

  function build(jobTitleId: string, requirementsAr: string | null, visited: Set<string>): CareerTreeNode {
    const nextVisited = new Set(visited);
    nextVisited.add(jobTitleId);
    const outgoing = byFrom.get(jobTitleId) ?? [];
    const children = outgoing
      .filter((edge) => !visited.has(edge.toJobTitleId))
      .map((edge) => build(edge.toJobTitleId, edge.requirementsAr, nextVisited));
    return { jobTitleId, requirementsAr, children };
  }

  return build(rootJobTitleId, null, new Set());
}

/** All job title ids appearing anywhere in the tree (root + every descendant). */
export function collectCareerTreeJobTitleIds(node: CareerTreeNode, acc: Set<string> = new Set()): Set<string> {
  acc.add(node.jobTitleId);
  for (const child of node.children) collectCareerTreeJobTitleIds(child, acc);
  return acc;
}
