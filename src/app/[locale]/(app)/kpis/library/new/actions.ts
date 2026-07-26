"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createKpiLibrarySchema = z.object({
  titleAr: z.string().trim().min(1),
  descriptionAr: z.string().trim().optional(),
  unitAr: z.string().trim().min(1),
  defaultWeight: z.coerce.number().min(0.01).max(100).optional(),
  orgUnitId: z.string().uuid().optional(),
});

export type CreateKpiLibraryState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `kpi_library` row — the "بنك مؤشرات الأداء" catalog entry,
 * optionally "distributed" to a department via org_unit_id — through the
 * caller's own RLS-respecting client. `kpi_library_insert` requires
 * `check_vpra('kpiLibrary','approve', orgUnitId)` (20260727000002),
 * `strategy_admin`-only per the seeded matrix, enforced by Postgres itself.
 */
export async function createKpiLibraryEntry(
  locale: Locale,
  _prevState: CreateKpiLibraryState,
  formData: FormData
): Promise<CreateKpiLibraryState> {
  const parsed = createKpiLibrarySchema.safeParse({
    titleAr: formData.get("titleAr"),
    descriptionAr: formData.get("descriptionAr") || undefined,
    unitAr: formData.get("unitAr"),
    defaultWeight: formData.get("defaultWeight") || undefined,
    orgUnitId: formData.get("orgUnitId") || undefined,
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

  const { titleAr, descriptionAr, unitAr, defaultWeight, orgUnitId } = parsed.data;

  const { error } = await supabase.from("kpi_library").insert({
    title_ar: titleAr,
    description_ar: descriptionAr || null,
    unit_ar: unitAr,
    default_weight: defaultWeight ?? null,
    org_unit_id: orgUnitId ?? null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: "/kpis/library", locale });
  return null;
}
