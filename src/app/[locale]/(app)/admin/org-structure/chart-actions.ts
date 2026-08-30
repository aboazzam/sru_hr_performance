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
 */
export async function saveOrgStructureChart(input: {
  imageUrl: string | null;
}): Promise<ChartActionState> {
  const parsed = z
    .object({ imageUrl: z.string().url().nullable() })
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

  const { data, error } = await supabase
    .from("org_structure_chart")
    .update({
      image_url: parsed.data.imageUrl,
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
    action: parsed.data.imageUrl ? "org_structure_chart_set" : "org_structure_chart_cleared",
    entity: "org_structure_chart",
    entity_id: data[0].id,
    after_data: { image_url: parsed.data.imageUrl },
  });

  return { status: "success" };
}
