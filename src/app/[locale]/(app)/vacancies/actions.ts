"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type VacancyActionState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" };

function mapError(error: { code?: string; message: string }): VacancyActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  return { status: "error", message: "unknown" };
}

const updateStatusSchema = z.object({
  vacancyId: z.string().uuid(),
  status: z.enum(["open", "closed", "filled"]),
});

/**
 * Changes a posting's status. Closes the real gap this tab had until now:
 * `vacancies_update`'s RLS (`check_vpra('vacancies','recommend',
 * org_unit_id)` — hr_admin + manager, 20260719000007) has existed since the
 * table was created, but NOTHING in the app ever issued an UPDATE, so a
 * posting could be created and never closed or marked filled.
 *
 * Authorization stays entirely with that policy — this action adds no
 * second gate, so a manager scoped to one org unit can close a posting in
 * their own unit and nowhere else, decided by Postgres, not by this code.
 * RLS denies an UPDATE by matching zero rows rather than erroring, so an
 * empty result is reported as "forbidden" rather than a silent success.
 */
export async function updateVacancyStatus(vacancyId: string, status: string): Promise<VacancyActionState> {
  const parsed = updateStatusSchema.safeParse({ vacancyId, status });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: before } = await supabase
    .from("vacancies")
    .select("status")
    .eq("id", parsed.data.vacancyId)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("vacancies")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.vacancyId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "vacancy_status_changed",
    entity: "vacancies",
    entity_id: parsed.data.vacancyId,
    before_data: before ? { status: before.status } : null,
    after_data: { status: parsed.data.status },
  });

  return { status: "success" };
}

/**
 * Advertises a vacancy ("أعلن عن الوظيفة") so it appears in the التوظيف
 * module's "الوظائف المعلن عنها" tab, or withdraws that advertisement.
 *
 * `announced_at IS NOT NULL` is the advertised flag (20260804000003) —
 * deliberately independent of `status`, so advertising doesn't silently
 * reopen a closed posting and closing one doesn't silently pull the ad.
 * `announced_by` is taken from the caller's own profile, never from the
 * client. Authorization is `vacancies_update`'s existing RLS
 * (`vacancies>=recommend`, hr_admin + manager, per org unit) — no second
 * gate here, and a zero-row UPDATE (RLS denial) is reported as "forbidden"
 * rather than a silent success.
 */
export async function setVacancyAnnouncement(
  vacancyId: string,
  announced: boolean
): Promise<VacancyActionState> {
  if (!z.string().uuid().safeParse(vacancyId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  let announcedBy: string | null = null;
  if (announced) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    announcedBy = profile?.id ?? null;
  }

  const { data: updated, error } = await supabase
    .from("vacancies")
    .update({
      announced_at: announced ? new Date().toISOString() : null,
      announced_by: announcedBy,
    })
    .eq("id", vacancyId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: announced ? "vacancy_announced" : "vacancy_unannounced",
    entity: "vacancies",
    entity_id: vacancyId,
    after_data: { announced },
  });

  return { status: "success" };
}

/**
 * Soft-delete (CLAUDE.md §5-A rule 7) — `vacancies` has no DELETE policy at
 * all, so this is an UPDATE setting `deleted_at`, gated by the same
 * `vacancies_update` policy as a status change.
 */
export async function deleteVacancy(vacancyId: string): Promise<VacancyActionState> {
  if (!z.string().uuid().safeParse(vacancyId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: deleted, error } = await supabase
    .from("vacancies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", vacancyId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!deleted || deleted.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "vacancy_deleted",
    entity: "vacancies",
    entity_id: vacancyId,
    after_data: { deleted: true },
  });

  return { status: "success" };
}
