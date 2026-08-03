"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropic } from "@/lib/ai/anthropic";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

export type JobTitleErrorMessage =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "duplicate"
  | "rate_limited"
  | "ai_error"
  | "unknown";

export type JobTitleActionState = { status: "success" } | { status: "error"; message: JobTitleErrorMessage };
export type SuggestDescriptionState =
  | { status: "success"; descriptionAr: string }
  | { status: "error"; message: JobTitleErrorMessage };

const jobTitleCategoryEnum = z.enum(["leadership", "academic", "admin", "technical", "labor"]);
const behavioralLevelEnum = z.enum(["basic", "practitioner", "advanced", "professional"]);

function mapError(error: { code?: string; message: string }): JobTitleActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "23514" || error.code === "23503") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

async function getCareerPathLevel(supabase: Awaited<ReturnType<typeof createClient>>): Promise<VpraLevel> {
  const { data } = await supabase.rpc("get_my_permissions");
  return (
    ((data ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "careerPath"
    )?.vpra_level ?? "none"
  );
}

// ----------------------------------------------------------------------------
// AI-assisted description drafting. Never saves anything -- returns a
// suggested draft the caller reviews/edits in the (already-existing)
// description textarea before an explicit Save. Rate-limited since each
// call is a real, billed Anthropic API request (checkRateLimit, same
// Postgres-backed limiter as login/forgot-password -- src/lib/rate-limit.ts).
// ----------------------------------------------------------------------------

const suggestDescriptionSchema = z.object({
  nameAr: z.string().trim().min(1),
  familyNameAr: z.string().trim().min(1),
  gradeLevel: z.coerce.number().int().min(1).max(16),
  category: jobTitleCategoryEnum,
  qualificationRequired: z.string().trim().optional(),
});

export async function suggestJobDescription(input: {
  nameAr: string;
  familyNameAr: string;
  gradeLevel: number;
  category: string;
  qualificationRequired?: string;
}): Promise<SuggestDescriptionState> {
  const parsed = suggestDescriptionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const level = await getCareerPathLevel(supabase);
  if (!hasVpraAccess(level, "prepare")) return { status: "error", message: "forbidden" };

  const allowed = await checkRateLimit(`career_path_ai:${actor.id}`, 20, 3600);
  if (!allowed) return { status: "error", message: "rate_limited" };

  const { nameAr, familyNameAr, gradeLevel, category, qualificationRequired } = parsed.data;

  try {
    const response = await anthropic.messages.create({
      // "claude-opus-4-8" is not a real model id -- confirmed live (2026-08-03)
      // that this made every single suggestion request fail (silently mapped
      // to the generic ai_error/"تعذّر توليد اقتراح حاليًا" message). Using the
      // real current Opus model id; a short, low-effort single-paragraph
      // description generation doesn't need Opus's top tier, but no cheaper
      // model was specifically requested, so keeping the same tier rather
      // than silently downgrading capability as part of an unrelated bug fix.
      model: "claude-opus-5",
      max_tokens: 500,
      output_config: { effort: "low" },
      system:
        'أنت مساعد متخصص في كتابة الأوصاف الوظيفية لجامعة سليمان الراجحي، بأسلوب عربي رسمي مقتضب (فقرة واحدة، 3-5 جمل). ' +
        "اكتب الوصف الوظيفي مباشرة بلا عنوان وبلا مقدمة وبلا تعليق، يبدأ بذكر شاغل الوظيفة ومسؤولياته. مثال على الأسلوب المطلوب:\n" +
        '"يتولى شاغل وظيفة \\"مدير مركز الاتصال\\" تنفيذ المهام التخصصية ضمن الوظائف الإدارية على المستوى الإداري/الاستشاري (الدرجة 11)، ' +
        "ويشمل ذلك إعداد التقارير وتقديم الدعم الفني والإداري اللازم لإنجاز أعمال الإدارة، والتنسيق مع الزملاء وأصحاب العلاقة لضمان جودة العمل ودقته.\"",
      messages: [
        {
          role: "user",
          content:
            `اكتب وصفًا وظيفيًا لوظيفة "${nameAr}" ضمن عائلة "${familyNameAr}"، الدرجة ${gradeLevel}، الفئة: ${category}` +
            (qualificationRequired ? `، المؤهل المطلوب: ${qualificationRequired}.` : "."),
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
    if (!text) return { status: "error", message: "ai_error" };
    return { status: "success", descriptionAr: text };
  } catch (e) {
    console.error("suggestJobDescription AI call failed:", e);
    return { status: "error", message: "ai_error" };
  }
}

// ----------------------------------------------------------------------------
// createJobTitle — new job_titles row + its required competencies (core,
// pre-selected by the caller, plus any manually added ones) + an optional
// career_path link into an existing job, all through the caller's own
// RLS-respecting client (careerPath prepare+ required by job_titles_insert /
// job_title_competencies_insert / career_path_insert). Every competency row
// must already carry a real requiredLevel -- Zod's enum rejects an
// unselected/empty value, enforcing "no default level" server-side too.
// ----------------------------------------------------------------------------

const createJobTitleSchema = z.object({
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
  jobFamilyId: z.string().uuid(),
  gradeLevel: z.coerce.number().int().min(1).max(16),
  category: jobTitleCategoryEnum,
  qualificationRequired: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
  competencies: z
    .array(z.object({ competencyId: z.string().uuid(), requiredLevel: behavioralLevelEnum }))
    .min(1),
  linkJobTitleId: z.string().uuid().optional(),
  linkDirection: z.enum(["predecessor", "successor"]).optional(),
  linkRequirementsAr: z.string().trim().optional(),
});

export async function createJobTitle(
  locale: Locale,
  input: {
    nameAr: string;
    nameEn?: string;
    jobFamilyId: string;
    gradeLevel: number;
    category: string;
    qualificationRequired?: string;
    descriptionAr?: string;
    competencies: Array<{ competencyId: string; requiredLevel: string }>;
    linkJobTitleId?: string;
    linkDirection?: "predecessor" | "successor";
    linkRequirementsAr?: string;
  }
): Promise<JobTitleActionState> {
  const parsed = createJobTitleSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: jobTitle, error: jtError } = await supabase
    .from("job_titles")
    .insert({
      name_ar: d.nameAr,
      name_en: d.nameEn || null,
      job_family_id: d.jobFamilyId,
      grade_level: d.gradeLevel,
      category: d.category,
      qualification_required: d.qualificationRequired || null,
      description_ar: d.descriptionAr || null,
    })
    .select("id")
    .single();
  if (jtError) return mapError(jtError);

  const competencyRows = d.competencies.map((c) => ({
    job_title_id: jobTitle.id,
    competency_id: c.competencyId,
    required_level: c.requiredLevel,
  }));
  const { error: compError } = await supabase.from("job_title_competencies").insert(competencyRows);
  if (compError) return mapError(compError);

  if (d.linkJobTitleId && d.linkDirection) {
    const edge =
      d.linkDirection === "predecessor"
        ? { from_job_title_id: d.linkJobTitleId, to_job_title_id: jobTitle.id }
        : { from_job_title_id: jobTitle.id, to_job_title_id: d.linkJobTitleId };
    const { error: edgeError } = await supabase
      .from("career_path")
      .insert({ ...edge, requirements_ar: d.linkRequirementsAr || null });
    if (edgeError) return mapError(edgeError);
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_title_created",
    entity: "job_titles",
    entity_id: jobTitle.id,
    after_data: { name_ar: d.nameAr, grade_level: d.gradeLevel, category: d.category },
  });

  redirect({ href: `/career-path/job-titles/${jobTitle.id}`, locale });
  return { status: "success" };
}

// ----------------------------------------------------------------------------
// updateJobTitleCore — edits the base fields of an existing job title (name/
// family/grade/category/qualification), distinct from description/
// competencies which already had their own actions in [id]/actions.ts.
// Same draft-reset rule as those: an edit by a non-approve actor reverts
// career_content_status to 'draft'.
// ----------------------------------------------------------------------------

const updateJobTitleCoreSchema = z.object({
  jobTitleId: z.string().uuid(),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
  jobFamilyId: z.string().uuid(),
  gradeLevel: z.coerce.number().int().min(1).max(16),
  category: jobTitleCategoryEnum,
  qualificationRequired: z.string().trim().optional(),
});

export async function updateJobTitleCore(input: {
  jobTitleId: string;
  nameAr: string;
  nameEn?: string;
  jobFamilyId: string;
  gradeLevel: number;
  category: string;
  qualificationRequired?: string;
}): Promise<JobTitleActionState> {
  const parsed = updateJobTitleCoreSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const level = await getCareerPathLevel(supabase);
  const resetToDraft = !hasVpraAccess(level, "approve");

  const { error } = await supabase
    .from("job_titles")
    .update({
      name_ar: d.nameAr,
      name_en: d.nameEn || null,
      job_family_id: d.jobFamilyId,
      grade_level: d.gradeLevel,
      category: d.category,
      qualification_required: d.qualificationRequired || null,
      ...(resetToDraft ? { career_content_status: "draft" as const } : {}),
    })
    .eq("id", d.jobTitleId);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_title_core_updated",
    entity: "job_titles",
    entity_id: d.jobTitleId,
    after_data: { name_ar: d.nameAr, grade_level: d.gradeLevel, category: d.category },
  });

  return { status: "success" };
}

// ----------------------------------------------------------------------------
// career_path edge CRUD -- the first real write UI for this table (it has
// existed with real RLS since 20260716000013, but no screen ever used it;
// data only ever arrived via the Excel-import migrations).
// ----------------------------------------------------------------------------

const createEdgeSchema = z
  .object({
    fromJobTitleId: z.string().uuid(),
    toJobTitleId: z.string().uuid(),
    requirementsAr: z.string().trim().optional(),
  })
  .refine((v) => v.fromJobTitleId !== v.toJobTitleId, { message: "from and to must differ" });

export async function createCareerPathEdge(
  fromJobTitleId: string,
  toJobTitleId: string,
  requirementsAr: string
): Promise<JobTitleActionState> {
  const parsed = createEdgeSchema.safeParse({
    fromJobTitleId,
    toJobTitleId,
    requirementsAr: requirementsAr || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: edge, error } = await supabase
    .from("career_path")
    .insert({
      from_job_title_id: parsed.data.fromJobTitleId,
      to_job_title_id: parsed.data.toJobTitleId,
      requirements_ar: parsed.data.requirementsAr ?? null,
    })
    .select("id")
    .single();
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "career_path_edge_created",
    entity: "career_path",
    entity_id: edge.id,
  });

  return { status: "success" };
}

export async function updateCareerPathEdge(edgeId: string, requirementsAr: string): Promise<JobTitleActionState> {
  const parsed = z
    .object({ edgeId: z.string().uuid(), requirementsAr: z.string().trim().optional() })
    .safeParse({ edgeId, requirementsAr: requirementsAr || undefined });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("career_path")
    .update({ requirements_ar: parsed.data.requirementsAr ?? null })
    .eq("id", parsed.data.edgeId);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "career_path_edge_updated",
    entity: "career_path",
    entity_id: parsed.data.edgeId,
  });

  return { status: "success" };
}

export async function removeCareerPathEdge(edgeId: string): Promise<JobTitleActionState> {
  const parsed = z.object({ edgeId: z.string().uuid() }).safeParse({ edgeId });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase
    .from("career_path")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.edgeId);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "career_path_edge_removed",
    entity: "career_path",
    entity_id: parsed.data.edgeId,
  });

  return { status: "success" };
}

// ----------------------------------------------------------------------------
// approveJobTitleCareerContent — the only action allowed to set
// career_content_status='approved'. Requires careerPath>=approve explicitly
// in application code, layered on top of job_titles_update's shared
// 'prepare'-level RLS bar -- same pattern as reviewPromotion/reviewReward
// (a single RLS policy at the lower bar, with the stricter approve-only
// decision enforced here, not in a separate policy).
// ----------------------------------------------------------------------------

export async function approveJobTitleCareerContent(jobTitleId: string): Promise<JobTitleActionState> {
  const parsed = z.object({ jobTitleId: z.string().uuid() }).safeParse({ jobTitleId });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const level = await getCareerPathLevel(supabase);
  if (!hasVpraAccess(level, "approve")) return { status: "error", message: "forbidden" };

  const { error } = await supabase
    .from("job_titles")
    .update({ career_content_status: "approved" })
    .eq("id", parsed.data.jobTitleId);
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_title_career_content_approved",
    entity: "job_titles",
    entity_id: parsed.data.jobTitleId,
  });

  return { status: "success" };
}
