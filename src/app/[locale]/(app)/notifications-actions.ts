"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks the caller's own notifications as read.
 *
 * Goes through the caller's own RLS-respecting client on purpose:
 * `notifications_update` (20260807000006) restricts both USING and WITH
 * CHECK to `recipient_id = my own profile`, so Postgres itself refuses to
 * mark someone else's notification read even if their id is passed in. No
 * application-level ownership check is duplicated here — the policy is the
 * gate, and the ids are simply filtered to what it allows.
 */
export async function markNotificationsRead(ids: string[]): Promise<{ updated: number }> {
  const parsed = z.array(z.string().uuid()).max(200).safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) return { updated: 0 };

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", parsed.data)
    .is("read_at", null)
    .select("id");

  return { updated: data?.length ?? 0 };
}
