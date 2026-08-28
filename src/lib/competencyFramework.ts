// Pure assembly of the DB-backed competency framework
// (competency_pillars -> competency_domains -> competencies -> competency_levels)
// into a nested tree, mirroring the "assemble small lookups in code" habit
// already used elsewhere in this app (e.g. career-path's domain/pillar
// lookup) rather than a multi-level PostgREST embed.

export type BehavioralLevel = "basic" | "practitioner" | "advanced" | "professional";

export const behavioralLevelOrder: BehavioralLevel[] = ["basic", "practitioner", "advanced", "professional"];

export interface CompetencyPillarRow {
  id: string;
  name_ar: string;
  name_en: string | null;
}

/** Admin-manageable list replacing the old fixed 'core'/'specialized' ENUM (20260829000001) -- "زر اضف تصنيف ... تصنيفات قابلة للإضافة لاحقًا". */
export interface CompetencyClassificationRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  /** When true, every competency of this classification auto-applies to every job title/employee everywhere in the app -- see computeAutoApplyClassificationIds. */
  auto_apply_everywhere: boolean;
}

export interface CompetencyDomainRow {
  id: string;
  pillar_id: string;
  name_ar: string;
  name_en: string | null;
}

export interface CompetencyRow {
  id: string;
  domain_id: string;
  name_ar: string;
  classification_id: string;
  definition_ar: string;
  expected_impact_ar: string;
  job_family_id: string | null;
}

export interface CompetencyLevelRow {
  competency_id: string;
  level: BehavioralLevel;
  behavior_ar: string;
  behavior_en: string | null;
}

export interface GroupedCompetency extends CompetencyRow {
  levels: Partial<Record<BehavioralLevel, CompetencyLevelRow>>;
}

export interface GroupedDomain extends CompetencyDomainRow {
  competencies: GroupedCompetency[];
}

export interface GroupedPillar extends CompetencyPillarRow {
  domains: GroupedDomain[];
}

/** Assembles flat rows (as fetched from Supabase) into pillar -> domain -> competency -> levels. Competencies/domains with no match simply get an empty children array, never dropped or thrown on. */
export function groupCompetencyFramework(
  pillars: CompetencyPillarRow[],
  domains: CompetencyDomainRow[],
  competencies: CompetencyRow[],
  levels: CompetencyLevelRow[]
): GroupedPillar[] {
  const levelsByCompetency = new Map<string, Partial<Record<BehavioralLevel, CompetencyLevelRow>>>();
  for (const row of levels) {
    const existing = levelsByCompetency.get(row.competency_id) ?? {};
    existing[row.level] = row;
    levelsByCompetency.set(row.competency_id, existing);
  }

  const competenciesByDomain = new Map<string, GroupedCompetency[]>();
  for (const c of competencies) {
    const list = competenciesByDomain.get(c.domain_id) ?? [];
    list.push({ ...c, levels: levelsByCompetency.get(c.id) ?? {} });
    competenciesByDomain.set(c.domain_id, list);
  }

  const domainsByPillar = new Map<string, GroupedDomain[]>();
  for (const d of domains) {
    const list = domainsByPillar.get(d.pillar_id) ?? [];
    list.push({ ...d, competencies: competenciesByDomain.get(d.id) ?? [] });
    domainsByPillar.set(d.pillar_id, list);
  }

  return pillars.map((p) => ({ ...p, domains: domainsByPillar.get(p.id) ?? [] }));
}

/** Every one of the 4 behavioral levels has real, non-blank text -- the bar every existing (seeded) competency already meets. Used to flag a competency whose framework content is still incomplete. */
export function isCompetencyLevelsComplete(levels: Partial<Record<BehavioralLevel, { behavior_ar: string }>>): boolean {
  return behavioralLevelOrder.every((level) => (levels[level]?.behavior_ar ?? "").trim().length > 0);
}

/**
 * The set of classification ids that should auto-apply everywhere -- the
 * replacement for every former `competencies.type === 'core'` check
 * (career-path job-title creation/detail, the job-titles Excel import,
 * employee competency scoring, 360 nomination). A classification's own
 * `auto_apply_everywhere` flag is admin-controlled (20260829000001), so this
 * is never hardcoded to a name -- more than one classification could carry
 * the flag, or none could.
 */
export function computeAutoApplyClassificationIds(classifications: CompetencyClassificationRow[]): Set<string> {
  return new Set(classifications.filter((c) => c.auto_apply_everywhere).map((c) => c.id));
}
