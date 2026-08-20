"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type AssignmentActionState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "not_hundred" | "no_lead" | "duplicate_unit" | "unknown";
    }
  | null;

const rowSchema = z.object({
  orgUnitId: z.string().uuid(),
  role: z.enum(["lead", "participant", "supporter"]),
  percentage: z.number().nullable(),
});

const schema = z.object({
  initiativeId: z.string().uuid(),
  rows: z.array(rowSchema),
});

/**
 * Saves an initiative's WHOLE assignment set at once, through the
 * `save_initiative_assignments` RPC (20260820000002) rather than row-by-row.
 *
 * The confirmed rules — exactly one lead unit, and lead + participant
 * percentages totalling 100, with supporters carrying no percentage — are
 * enforced inside that function, in one transaction, so a rejected save
 * leaves the previous assignment untouched instead of half-replacing it.
 * They are ALSO checked here, purely so the caller gets a specific Arabic
 * message instead of a raw Postgres exception; the database remains the
 * authority.
 *
 * The RPC is SECURITY INVOKER, so real authorization stays
 * initiative_assignments' own RLS (strategicPlanning='approve').
 */
export async function saveInitiativeAssignments(
  _prev: AssignmentActionState,
  formData: FormData
): Promise<AssignmentActionState> {
  const rawRows = formData.get("rows");
  let parsedRows: unknown;
  try {
    parsedRows = JSON.parse(typeof rawRows === "string" ? rawRows : "null");
  } catch {
    return { status: "error", message: "invalid_input" };
  }

  const parsed = schema.safeParse({ initiativeId: formData.get("initiativeId"), rows: parsedRows });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { initiativeId, rows } = parsed.data;

  if (rows.length > 0) {
    const leads = rows.filter((r) => r.role === "lead").length;
    if (leads !== 1) return { status: "error", message: "no_lead" };
    if (new Set(rows.map((r) => r.orgUnitId)).size !== rows.length) return { status: "error", message: "duplicate_unit" };
    for (const r of rows) {
      if (r.role === "supporter" && r.percentage != null) return { status: "error", message: "invalid_input" };
      if (r.role !== "supporter" && (r.percentage == null || r.percentage <= 0 || r.percentage > 100)) {
        return { status: "error", message: "invalid_input" };
      }
    }
    const total = rows.reduce((sum, r) => sum + (r.role === "supporter" ? 0 : r.percentage ?? 0), 0);
    // Compared with a small epsilon: the inputs are decimals typed by hand,
    // and 60.1 + 39.9 is not exactly 100 in binary floating point.
    if (Math.abs(total - 100) > 0.001) return { status: "error", message: "not_hundred" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase.rpc("save_initiative_assignments", {
    p_initiative_id: initiativeId,
    p_rows: rows.map((r) => ({
      org_unit_id: r.orgUnitId,
      role: r.role,
      percentage: r.role === "supporter" ? null : r.percentage,
      notes: null,
    })),
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) return { status: "error", message: "forbidden" };
    if (error.message.includes("must total 100")) return { status: "error", message: "not_hundred" };
    if (error.message.includes("one lead")) return { status: "error", message: "no_lead" };
    if (error.message.includes("duplicate org unit")) return { status: "error", message: "duplicate_unit" };
    return { status: "error", message: "unknown" };
  }

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: rows.length === 0 ? "initiative_assignment_cleared" : "initiative_assigned",
      entity: "strategic_initiatives",
      entity_id: initiativeId,
      after_data: { units: rows.length, rows },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/initiative-assignments", "page");
  return { status: "success" };
}
