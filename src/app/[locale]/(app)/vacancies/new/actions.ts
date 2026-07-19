"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createVacancySchema = z.object({
  jobTitleId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  requirementsAr: z.string().trim().optional(),
});

export type CreateVacancyState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `vacancies` row (status defaults to 'open' at the DB level --
 * no documented status vocabulary exists, same precedent as
 * `promotions.status`/`rewards.status`) through the caller's own
 * RLS-respecting client -- `vacancies_insert` requires
 * `check_vpra('vacancies','approve', orgUnitId)` (20260719000007),
 * `hr_admin`-only per the real seeded matrix; every other role
 * (including `manager`, who only reaches `'recommend'`) gets "forbidden,"
 * enforced by Postgres itself.
 */
export async function createVacancy(
  locale: Locale,
  _prevState: CreateVacancyState,
  formData: FormData
): Promise<CreateVacancyState> {
  const parsed = createVacancySchema.safeParse({
    jobTitleId: formData.get("jobTitleId"),
    orgUnitId: formData.get("orgUnitId"),
    requirementsAr: formData.get("requirementsAr") || undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "unauthenticated" };
  }

  const { jobTitleId, orgUnitId, requirementsAr } = parsed.data;

  const { error } = await supabase.from("vacancies").insert({
    job_title_id: jobTitleId,
    org_unit_id: orgUnitId,
    requirements_ar: requirementsAr || null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: "/vacancies", locale });
  return null;
}
