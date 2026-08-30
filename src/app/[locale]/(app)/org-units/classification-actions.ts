"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PostgrestError } from "@supabase/supabase-js";

export type ClassificationActionState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "in_use" | "unknown";
    };

/**
 * The two user-owned classification lists behind the org-units screen:
 * `org_unit_kinds` (الشكل التنظيمي) and `org_unit_types` (نوع الإدارة).
 *
 * Both were fixed lists until 20260830000002 — `kind` was a Postgres ENUM, so
 * "add قسم" meant writing a migration. They are ordinary rows now, and this
 * file is what lets the screen add to them.
 *
 * Every write goes through the caller's own client, so the real gate stays
 * each table's own RLS (`check_vpra_global('employeeData', 'approve')`) rather
 * than anything decided here. A write RLS refuses simply matches no rows, so
 * every statement selects back and treats an empty result as "forbidden"
 * instead of reporting a success that never happened.
 */
type Table = "org_unit_kinds" | "org_unit_types";

const TABLES: readonly Table[] = ["org_unit_kinds", "org_unit_types"] as const;

function mapError(error: PostgrestError): ClassificationActionState {
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  // ON DELETE RESTRICT on org_units.kind_id: the row is still classifying
  // real units. Reported as its own message, not a generic failure.
  if (error.code === "23503") return { status: "error", message: "in_use" };
  return { status: "error", message: "unknown" };
}

const inputSchema = z.object({
  table: z.enum(TABLES),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().nullable().optional(),
});

/**
 * Derives the stored `code` from the English name when given, else from a
 * slug of the Arabic one, else a timestamp-free fallback built from the
 * table name — `code` is NOT NULL and unique, and asking the user for a
 * machine key they never see would be noise.
 */
function deriveCode(nameAr: string, nameEn: string | null): string {
  const base = (nameEn ?? nameAr)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "kind" : base.slice(0, 40);
}

export async function createClassification(input: {
  table: Table;
  nameAr: string;
  nameEn?: string | null;
}): Promise<ClassificationActionState> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const nameEn = parsed.data.nameEn?.trim() || null;

  // Appended to the end of the list rather than dropped at 0: a new entry
  // belongs after the ones already ordered, not silently first.
  const { data: last } = await supabase
    .from(parsed.data.table)
    .select("display_order")
    .is("deleted_at", null)
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder = ((last ?? [])[0]?.display_order ?? 0) + 10;

  const { data, error } = await supabase
    .from(parsed.data.table)
    .insert({
      code: deriveCode(parsed.data.nameAr, nameEn),
      name_ar: parsed.data.nameAr,
      name_en: nameEn,
      display_order: nextOrder,
    })
    .select("id");
  if (error) return mapError(error);
  if (!data || data.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_unit_classification_created",
    entity: parsed.data.table,
    entity_id: data[0].id,
    after_data: { name_ar: parsed.data.nameAr, name_en: nameEn },
  });

  return { status: "success" };
}

export async function updateClassification(input: {
  table: Table;
  id: string;
  nameAr: string;
  nameEn?: string | null;
}): Promise<ClassificationActionState> {
  const parsed = inputSchema.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const nameEn = parsed.data.nameEn?.trim() || null;

  // `code` is deliberately NOT rederived on rename: it is the stable key the
  // Excel import and the original migration match on, so letting a rename
  // move it would quietly break files that already reference the old one.
  const { data, error } = await supabase
    .from(parsed.data.table)
    .update({ name_ar: parsed.data.nameAr, name_en: nameEn })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!data || data.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_unit_classification_updated",
    entity: parsed.data.table,
    entity_id: parsed.data.id,
    after_data: { name_ar: parsed.data.nameAr, name_en: nameEn },
  });

  return { status: "success" };
}

export async function deleteClassification(input: {
  table: Table;
  id: string;
}): Promise<ClassificationActionState> {
  const parsed = z.object({ table: z.enum(TABLES), id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  // Checked here, not left to the foreign key: this is a SOFT delete
  // (`deleted_at`, §5-A rule 7), and ON DELETE RESTRICT only guards a real
  // DELETE. Without this a classification could be hidden while units still
  // carry it, leaving them with a blank column and no way back.
  const column = parsed.data.table === "org_unit_kinds" ? "kind_id" : "type_id";
  const { count } = await supabase
    .from("org_units")
    .select("id", { count: "exact", head: true })
    .eq(column, parsed.data.id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) return { status: "error", message: "in_use" };

  const { data, error } = await supabase
    .from(parsed.data.table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!data || data.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_unit_classification_deleted",
    entity: parsed.data.table,
    entity_id: parsed.data.id,
  });

  return { status: "success" };
}
