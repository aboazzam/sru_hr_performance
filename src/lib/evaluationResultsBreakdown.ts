/**
 * Two alternative "breakdown" views for the نتائج التقييم dashboard's broad
 * section, switched by a filter (requested directly, 2026-09-08: "هل
 * بالامكان تعمل فلترة بحيث استطيع اعرضهما على حسب الفلتر (الوحدات
 * التنظيمية أو الفئات)؟"):
 *
 *  - `buildOrgUnitResultsTree`: the org-unit breakdown re-shaped into a real
 *    nested tree matching `org_units.parent_id`, the same hierarchy the
 *    "الوحدات التنظيمية" screen itself renders — not the flat, sorted-by-
 *    average table this replaces. Pruned to only units that themselves have
 *    a result OR are an ancestor of one; an ancestor with no result of its
 *    own still appears (count 0, average null) so the tree stays connected
 *    rather than jumping straight to unrelated-looking leaves.
 *  - `groupResultsByBand`: the same five RATING_BANDS, each carrying the
 *    real employees inside it — an expandable "فئة → موظفون" tree (native
 *    `<details>` in the component), rather than only a percentage bar.
 *
 * Both are pure and take already-fetched rows — no Supabase calls here.
 */

import { RATING_BANDS, type RatingBandId } from "./ratingBands";

export interface OrgUnitTreeNode {
  id: string;
  name: string;
  /** Employees with a computed score DIRECTLY in this unit — never rolled up from children, so a number here is never invented. */
  count: number;
  average: number | null;
  children: OrgUnitTreeNode[];
}

function average(scores: readonly number[]): number | null {
  return scores.length === 0 ? null : scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

/** A stable id for the "no department" bucket — never a real org_units id. */
export const UNASSIGNED_ORG_UNIT_KEY = "__unassigned__";

export function buildOrgUnitResultsTree(
  orgUnits: ReadonlyArray<{ id: string; name: string; parentId: string | null }>,
  results: ReadonlyArray<{ orgUnitId: string | null; score: number | null }>,
  unassignedLabel: string
): OrgUnitTreeNode[] {
  const scoresByUnit = new Map<string, number[]>();
  const unassignedScores: number[] = [];
  for (const row of results) {
    if (row.score == null) continue;
    if (row.orgUnitId == null) {
      unassignedScores.push(row.score);
      continue;
    }
    const list = scoresByUnit.get(row.orgUnitId) ?? [];
    list.push(row.score);
    scoresByUnit.set(row.orgUnitId, list);
  }

  const parentById = new Map(orgUnits.map((u) => [u.id, u.parentId]));
  const nameById = new Map(orgUnits.map((u) => [u.id, u.name]));

  // Ancestor closure: every unit that directly has a result, plus every
  // ancestor up to the root — so a leaf with results never appears
  // disconnected from the tree it actually belongs to.
  const keep = new Set<string>();
  for (const unitId of scoresByUnit.keys()) {
    let current: string | null = unitId;
    const guard = new Set<string>(); // corrupted parent_id cycle guard
    while (current != null && !guard.has(current)) {
      guard.add(current);
      if (keep.has(current)) break;
      keep.add(current);
      current = parentById.get(current) ?? null;
    }
  }

  const childIdsByParent = new Map<string | null, string[]>();
  for (const id of keep) {
    const parentId = parentById.get(id) ?? null;
    const parentKept = parentId != null && keep.has(parentId) ? parentId : null;
    const list = childIdsByParent.get(parentKept) ?? [];
    list.push(id);
    childIdsByParent.set(parentKept, list);
  }
  const byArabicName = (a: string, b: string) => (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "", "ar");
  for (const list of childIdsByParent.values()) list.sort(byArabicName);

  function buildNode(id: string): OrgUnitTreeNode {
    const scores = scoresByUnit.get(id) ?? [];
    return {
      id,
      name: nameById.get(id) ?? "—",
      count: scores.length,
      average: average(scores),
      children: (childIdsByParent.get(id) ?? []).map(buildNode),
    };
  }

  const roots = (childIdsByParent.get(null) ?? []).map(buildNode);

  if (unassignedScores.length > 0) {
    roots.push({
      id: UNASSIGNED_ORG_UNIT_KEY,
      name: unassignedLabel,
      count: unassignedScores.length,
      average: average(unassignedScores),
      children: [],
    });
  }

  return roots;
}

export interface BandGroupEmployee {
  employeeNumber: string | null;
  employeeName: string | null;
  orgUnitName: string | null;
  score: number;
}

export interface BandGroup {
  bandId: RatingBandId;
  labelAr: string;
  count: number;
  /** Share of every SCORED result — bands with zero still appear, in RATING_BANDS' fixed order. */
  pct: number;
  employees: BandGroupEmployee[];
}

export interface EvaluationResultForBandGrouping {
  employeeNumber: string | null;
  employeeName: string | null;
  orgUnitName: string | null;
  bandId: RatingBandId | null;
  score: number | null;
}

export function groupResultsByBand(rows: readonly EvaluationResultForBandGrouping[]): BandGroup[] {
  const scored = rows.filter((row): row is EvaluationResultForBandGrouping & { score: number } => row.score != null);
  return RATING_BANDS.map((band) => {
    const employees = scored.filter((row) => row.bandId === band.id);
    return {
      bandId: band.id,
      labelAr: band.labelAr,
      count: employees.length,
      pct: scored.length > 0 ? Math.round((employees.length / scored.length) * 100) : 0,
      employees: employees
        .map((row) => ({
          employeeNumber: row.employeeNumber,
          employeeName: row.employeeName,
          orgUnitName: row.orgUnitName,
          score: row.score,
        }))
        .sort((a, b) => b.score - a.score),
    };
  });
}
