"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SaveCalibrationResultsState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "not_found" | "forbidden" | "unknown";
    }
  | null;

const ratingFieldSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v))
  .pipe(
    z
      .string()
      .refine((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100), {
        message: "rating out of range",
      })
      .nullable()
  );

/**
 * Saves calibrated ratings for one calibration session
 * (`calibration_results`, migration 20260719000004). The set of rated
 * employees is NOT trusted from the client -- re-derived here from
 * `profiles` filtered to the session's own `org_unit_id` (same subjects
 * the detail page itself lists), then matched against form fields named
 * `original_<id>` / `calibrated_<id>` / `justification_<id>`.
 *
 * Each row is written through the caller's own RLS-respecting client --
 * real authorization is `calibration_results`' own INSERT/UPDATE policies
 * (`check_vpra('calibration','approve'|'recommend', ...)`,
 * 20260719000004), not application code. No `.upsert()`, same reasoning
 * as `saveEvaluationScores`: the table's uniqueness is a PARTIAL index
 * (`WHERE deleted_at IS NULL`), and PostgREST's `on_conflict` inference
 * can't target it -- an explicit select-then-insert-or-update per row
 * avoids that entirely.
 */
export async function saveCalibrationResults(
  sessionId: string,
  _prevState: SaveCalibrationResultsState,
  formData: FormData
): Promise<SaveCalibrationResultsState> {
  const parsedId = z.string().uuid().safeParse(sessionId);
  if (!parsedId.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: session } = await supabase
    .from("calibration_sessions")
    .select("id, org_unit_id")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (!session) {
    return { status: "error", message: "not_found" };
  }

  const { data: employees } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_unit_id", session.org_unit_id)
    .is("deleted_at", null);

  type Row = {
    employeeId: string;
    originalRating: string | null;
    calibratedRating: string | null;
    justification: string | null;
  };
  const rows: Row[] = [];

  for (const employee of employees ?? []) {
    const originalParsed = ratingFieldSchema.safeParse(
      formData.get(`original_${employee.id}`)?.toString()
    );
    const calibratedParsed = ratingFieldSchema.safeParse(
      formData.get(`calibrated_${employee.id}`)?.toString()
    );
    const justification = formData.get(`justification_${employee.id}`)?.toString().trim();

    if (!originalParsed.success || !calibratedParsed.success) {
      return { status: "error", message: "invalid_input" };
    }

    rows.push({
      employeeId: employee.id,
      originalRating: originalParsed.data,
      calibratedRating: calibratedParsed.data,
      justification: justification || null,
    });
  }

  let touched = 0;

  for (const row of rows) {
    const { data: existing } = await supabase
      .from("calibration_results")
      .select("id")
      .eq("session_id", parsedId.data)
      .eq("employee_id", row.employeeId)
      .maybeSingle();

    // Nothing to save and nothing to clear — skip, don't create an
    // all-null row for an employee the reviewer never touched.
    if (!existing && row.originalRating === null && row.calibratedRating === null && row.justification === null) {
      continue;
    }

    const payload = {
      original_rating: row.originalRating === null ? null : Number(row.originalRating),
      calibrated_rating: row.calibratedRating === null ? null : Number(row.calibratedRating),
      justification: row.justification,
    };

    const { error } = existing
      ? await supabase.from("calibration_results").update(payload).eq("id", existing.id)
      : await supabase
          .from("calibration_results")
          .insert({ session_id: parsedId.data, employee_id: row.employeeId, ...payload });

    if (error) {
      if (error.code === "42501" || error.message.includes("row-level security")) {
        return { status: "error", message: "forbidden" };
      }
      if (error.code === "23514") {
        return { status: "error", message: "invalid_input" };
      }
      return { status: "error", message: "unknown" };
    }

    touched++;
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "calibration_results_saved",
    entity: "calibration_results",
    entity_id: parsedId.data,
    after_data: { employees_saved: touched },
  });

  return { status: "success" };
}
