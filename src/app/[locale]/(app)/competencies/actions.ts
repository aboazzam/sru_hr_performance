"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { behavioralLevelOrder, type BehavioralLevel } from "@/lib/competencyFramework";

export type CompetencyErrorMessage =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "has_dependents"
  | "duplicate"
  | "unknown";

export type CompetencyActionState =
  | { status: "success" }
  | { status: "error"; message: CompetencyErrorMessage };

const levelsInputSchema = z.object({
  basic: z.string().trim().min(1),
  practitioner: z.string().trim().min(1),
  advanced: z.string().trim().min(1),
  professional: z.string().trim().min(1),
});

function mapErrorMessage(error: { code?: string; message: string }): CompetencyErrorMessage {
  if (error.code === "23505") return "duplicate";
  if (error.code === "42501" || error.message.includes("row-level security")) return "forbidden";
  return "unknown";
}

function mapError(error: { code?: string; message: string }): CompetencyActionState {
  return { status: "error", message: mapErrorMessage(error) };
}

async function requireActor() {
  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  return { supabase, actor };
}

function levelRows(competencyId: string, levels: Record<BehavioralLevel, string>) {
  return behavioralLevelOrder.map((level) => ({
    competency_id: competencyId,
    level,
    behavior_ar: levels[level],
  }));
}

// ---------------------------------------------------------------------------
// Pillars — real authorization is competency_pillars_insert/update/delete's
// RLS (check_vpra_global('competencyFramework', 'prepare'|'prepare'|'approve')).
// ---------------------------------------------------------------------------

const pillarInputSchema = z.object({ nameAr: z.string().trim().min(1), nameEn: z.string().trim().optional() });

export async function addCompetencyPillar(nameAr: string, nameEn: string): Promise<CompetencyActionState> {
  const parsed = pillarInputSchema.safeParse({ nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: pillar, error } = await supabase
    .from("competency_pillars")
    .insert({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .select("id")
    .single();
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_pillar_added",
    entity: "competency_pillars",
    entity_id: pillar.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

const updatePillarSchema = z.object({ id: z.string().uuid(), nameAr: z.string().trim().min(1), nameEn: z.string().trim().optional() });

export async function updateCompetencyPillar(id: string, nameAr: string, nameEn: string): Promise<CompetencyActionState> {
  const parsed = updatePillarSchema.safeParse({ id, nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("competency_pillars")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .eq("id", parsed.data.id);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_pillar_updated",
    entity: "competency_pillars",
    entity_id: parsed.data.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

/** Blocked while the pillar still has any domain under it -- a hard DELETE would otherwise cascade and silently wipe every domain/competency/level beneath it. */
export async function deleteCompetencyPillar(id: string): Promise<CompetencyActionState> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { count } = await supabase.from("competency_domains").select("id", { count: "exact", head: true }).eq("pillar_id", parsed.data);
  if (count && count > 0) return { status: "error", message: "has_dependents" };

  const { error } = await supabase.from("competency_pillars").delete().eq("id", parsed.data);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_id: actor.id, action: "competency_pillar_deleted", entity: "competency_pillars", entity_id: parsed.data });

  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Classifications — replaces the old fixed competency_type ENUM
// (20260829000001). Same has_dependents/CRUD shape as pillars: real
// authorization is competency_classifications_insert/update/delete's RLS.
// ---------------------------------------------------------------------------

const classificationInputSchema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
  autoApplyEverywhere: z.boolean(),
});

export async function addCompetencyClassification(
  nameAr: string,
  nameEn: string,
  autoApplyEverywhere: boolean
): Promise<CompetencyActionState> {
  const parsed = classificationInputSchema.safeParse({ nameAr, nameEn: nameEn || undefined, autoApplyEverywhere });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: classification, error } = await supabase
    .from("competency_classifications")
    .insert({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null, auto_apply_everywhere: parsed.data.autoApplyEverywhere })
    .select("id")
    .single();
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_classification_added",
    entity: "competency_classifications",
    entity_id: classification.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null, auto_apply_everywhere: parsed.data.autoApplyEverywhere },
  });

  return { status: "success" };
}

const updateClassificationSchema = z.object({
  id: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
  autoApplyEverywhere: z.boolean(),
});

export async function updateCompetencyClassification(
  id: string,
  nameAr: string,
  nameEn: string,
  autoApplyEverywhere: boolean
): Promise<CompetencyActionState> {
  const parsed = updateClassificationSchema.safeParse({ id, nameAr, nameEn: nameEn || undefined, autoApplyEverywhere });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("competency_classifications")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null, auto_apply_everywhere: parsed.data.autoApplyEverywhere })
    .eq("id", parsed.data.id);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_classification_updated",
    entity: "competency_classifications",
    entity_id: parsed.data.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null, auto_apply_everywhere: parsed.data.autoApplyEverywhere },
  });

  return { status: "success" };
}

/** Blocked while any competency still uses this classification -- the FK is RESTRICT too, but this gives a clear has_dependents message instead of a raw DB error. */
export async function deleteCompetencyClassification(id: string): Promise<CompetencyActionState> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { count } = await supabase.from("competencies").select("id", { count: "exact", head: true }).eq("classification_id", parsed.data);
  if (count && count > 0) return { status: "error", message: "has_dependents" };

  const { error } = await supabase.from("competency_classifications").delete().eq("id", parsed.data);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_classification_deleted",
    entity: "competency_classifications",
    entity_id: parsed.data,
  });

  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

const addDomainSchema = z.object({ pillarId: z.string().uuid(), nameAr: z.string().trim().min(1), nameEn: z.string().trim().optional() });

export async function addCompetencyDomain(pillarId: string, nameAr: string, nameEn: string): Promise<CompetencyActionState> {
  const parsed = addDomainSchema.safeParse({ pillarId, nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: domain, error } = await supabase
    .from("competency_domains")
    .insert({ pillar_id: parsed.data.pillarId, name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .select("id")
    .single();
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_domain_added",
    entity: "competency_domains",
    entity_id: domain.id,
    after_data: { pillar_id: parsed.data.pillarId, name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

const updateDomainSchema = z.object({ id: z.string().uuid(), nameAr: z.string().trim().min(1), nameEn: z.string().trim().optional() });

export async function updateCompetencyDomain(id: string, nameAr: string, nameEn: string): Promise<CompetencyActionState> {
  const parsed = updateDomainSchema.safeParse({ id, nameAr, nameEn: nameEn || undefined });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("competency_domains")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .eq("id", parsed.data.id);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_domain_updated",
    entity: "competency_domains",
    entity_id: parsed.data.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null },
  });

  return { status: "success" };
}

/** Blocked while the domain still has any non-archived competency under it, same has_dependents discipline as deleteCompetencyPillar. */
export async function deleteCompetencyDomain(id: string): Promise<CompetencyActionState> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { count } = await supabase
    .from("competencies")
    .select("id", { count: "exact", head: true })
    .eq("domain_id", parsed.data)
    .is("deleted_at", null);
  if (count && count > 0) return { status: "error", message: "has_dependents" };

  const { error } = await supabase.from("competency_domains").delete().eq("id", parsed.data);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_id: actor.id, action: "competency_domain_deleted", entity: "competency_domains", entity_id: parsed.data });

  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Competencies + their 4 behavioral levels
// ---------------------------------------------------------------------------

const addCompetencySchema = z.object({
  domainId: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  classificationId: z.string().uuid(),
  definitionAr: z.string().trim().min(1),
  expectedImpactAr: z.string().trim().min(1),
  jobFamilyId: z.string().uuid().optional(),
  levels: levelsInputSchema,
});

export async function addCompetency(input: {
  domainId: string;
  nameAr: string;
  classificationId: string;
  definitionAr: string;
  expectedImpactAr: string;
  jobFamilyId?: string;
  levels: Record<BehavioralLevel, string>;
}): Promise<CompetencyActionState> {
  const parsed = addCompetencySchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: competency, error } = await supabase
    .from("competencies")
    .insert({
      domain_id: parsed.data.domainId,
      name_ar: parsed.data.nameAr,
      classification_id: parsed.data.classificationId,
      definition_ar: parsed.data.definitionAr,
      expected_impact_ar: parsed.data.expectedImpactAr,
      job_family_id: parsed.data.jobFamilyId ?? null,
    })
    .select("id")
    .single();
  if (error) return mapError(error);

  const { error: levelsError } = await supabase.from("competency_levels").insert(levelRows(competency.id, parsed.data.levels));
  if (levelsError) return mapError(levelsError);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_added",
    entity: "competencies",
    entity_id: competency.id,
    after_data: { domain_id: parsed.data.domainId, name_ar: parsed.data.nameAr, classification_id: parsed.data.classificationId },
  });

  return { status: "success" };
}

const updateCompetencySchema = z.object({
  id: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  classificationId: z.string().uuid(),
  definitionAr: z.string().trim().min(1),
  expectedImpactAr: z.string().trim().min(1),
  jobFamilyId: z.string().uuid().nullable(),
});

export async function updateCompetency(input: {
  id: string;
  nameAr: string;
  classificationId: string;
  definitionAr: string;
  expectedImpactAr: string;
  jobFamilyId: string | null;
}): Promise<CompetencyActionState> {
  const parsed = updateCompetencySchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("competencies")
    .update({
      name_ar: parsed.data.nameAr,
      classification_id: parsed.data.classificationId,
      definition_ar: parsed.data.definitionAr,
      expected_impact_ar: parsed.data.expectedImpactAr,
      job_family_id: parsed.data.jobFamilyId,
    })
    .eq("id", parsed.data.id);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_updated",
    entity: "competencies",
    entity_id: parsed.data.id,
    after_data: { name_ar: parsed.data.nameAr, classification_id: parsed.data.classificationId },
  });

  return { status: "success" };
}

const updateLevelsSchema = z.object({ competencyId: z.string().uuid(), levels: levelsInputSchema });

/** The 4 (competency_id, level) rows are a real, non-partial UNIQUE constraint (unlike this project's usual partial-index gotcha), so a plain upsert on that conflict target is safe -- no select-then-insert-or-update workaround needed. */
export async function updateCompetencyLevels(competencyId: string, levels: Record<BehavioralLevel, string>): Promise<CompetencyActionState> {
  const parsed = updateLevelsSchema.safeParse({ competencyId, levels });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("competency_levels")
    .upsert(levelRows(parsed.data.competencyId, parsed.data.levels), { onConflict: "competency_id,level" });
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "competency_levels_updated",
    entity: "competencies",
    entity_id: parsed.data.competencyId,
  });

  return { status: "success" };
}

/** Soft-delete (competencies has no DELETE policy, CLAUDE.md §5-A rule 7). Blocked while any active job_title_competencies row still references it -- archiving out from under an assigned job title would silently strand that requirement. */
export async function archiveCompetency(id: string): Promise<CompetencyActionState> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, actor } = await requireActor();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { count } = await supabase
    .from("job_title_competencies")
    .select("id", { count: "exact", head: true })
    .eq("competency_id", parsed.data)
    .is("deleted_at", null);
  if (count && count > 0) return { status: "error", message: "has_dependents" };

  const { error } = await supabase.from("competencies").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_id: actor.id, action: "competency_archived", entity: "competencies", entity_id: parsed.data });

  return { status: "success" };
}
