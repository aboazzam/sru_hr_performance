"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ChartActionState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" };

/**
 * Points the org structure screen at an uploaded image, or clears it.
 *
 * The file itself is uploaded straight to Storage from the browser under the
 * caller's own session, so the bucket's policies (orgStructure >= prepare)
 * gate the upload. This only records WHICH file the screen shows, through the
 * caller's own client again — so `org_structure_chart_update` is the real
 * gate, and a refusal matches no rows rather than raising, which is why the
 * update selects back and treats an empty result as forbidden.
 *
 * `locale` picks the column: the Arabic and English chart images are two
 * independent uploads (2026-08-31 — "نحتاج مكان نرفع فيه النسخة الانجليزية
 * بحيث يتم رفعها عند تصفح المشروع بصفحاته الانجليزية"), shown to whoever is
 * browsing that locale's pages, edited from the same admin screen regardless
 * of which locale the admin themselves is currently browsing in.
 */
export async function saveOrgStructureChart(input: {
  locale: "ar" | "en";
  imageUrl: string | null;
}): Promise<ChartActionState> {
  const parsed = z
    .object({ locale: z.enum(["ar", "en"]), imageUrl: z.string().url().nullable() })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const column = parsed.data.locale === "en" ? "image_url_en" : "image_url";

  const { data, error } = await supabase
    .from("org_structure_chart")
    .update({
      [column]: parsed.data.imageUrl,
      updated_at: new Date().toISOString(),
      updated_by: profile?.id ?? null,
    })
    // The table holds exactly one row (a unique index on a constant
    // expression), so an unfiltered update is the row, not a mass write.
    .not("id", "is", null)
    .select("id");
  if (error) return { status: "error", message: "unknown" };
  if (!data || data.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: parsed.data.imageUrl
      ? (parsed.data.locale === "en" ? "org_structure_chart_en_set" : "org_structure_chart_set")
      : (parsed.data.locale === "en" ? "org_structure_chart_en_cleared" : "org_structure_chart_cleared"),
    entity: "org_structure_chart",
    entity_id: data[0].id,
    after_data: { [column]: parsed.data.imageUrl },
  });

  return { status: "success" };
}
