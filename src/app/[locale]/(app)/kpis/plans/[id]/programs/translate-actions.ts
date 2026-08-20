"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropic } from "@/lib/ai/anthropic";

export type SuggestTitleState =
  | { status: "success"; titleEn: string }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "rate_limited" | "ai_error" }
  | null;

const schema = z.object({
  titleAr: z.string().trim().min(2).max(300),
  context: z.string().trim().max(600).optional(),
});

/**
 * Suggests an English name for an initiative, for the author to accept or
 * edit — it NEVER saves anything, exactly like suggestJobDescription, whose
 * shape this follows (same shared client, same Postgres-backed rate limiter,
 * same "returns a draft, the form owns the value" contract).
 *
 * Rate-limited per caller because every call is a real, billed API request.
 *
 * KNOWN DEPLOYMENT REQUIREMENT: this project's server env has no
 * ANTHROPIC_API_KEY (confirmed 2026-08-03 while fixing the job-description
 * suggester: the SDK constructs fine but every request fails on missing
 * credentials). Until that key is added to .env.local on the server and the
 * process restarted, this returns `ai_error` and the user simply types the
 * English name themselves — the field stays fully usable either way, which
 * is why the button is an assist and not a gate.
 */
export async function suggestInitiativeTitleEn(input: { titleAr: string; context?: string }): Promise<SuggestTitleState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  // No VPRA gate beyond being signed in: this neither reads nor writes any
  // business row — it only translates text the caller already typed.
  const allowed = await checkRateLimit(`initiative_title_ai:${user.id}`, 30, 3600);
  if (!allowed) return { status: "error", message: "rate_limited" };

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 120,
      output_config: { effort: "low" },
      system:
        "You translate Arabic strategic-initiative names into English for a Saudi university's planning system. " +
        "Reply with the English name ONLY — no quotes, no explanation, no alternatives, no trailing period. " +
        "Keep it a short title in title case, not a sentence. Preserve well-known acronyms as they are (ERP, KPI, IT). " +
        'Example: "تفعيل نظام ال ERP" -> "ERP System Activation".',
      messages: [
        {
          role: "user",
          content:
            `اسم المبادرة بالعربية: "${parsed.data.titleAr}"` +
            (parsed.data.context ? `\nسياق إضافي (الهدف/المخرج): ${parsed.data.context}` : ""),
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
    if (!text) return { status: "error", message: "ai_error" };
    // The model is asked for a bare title; strip stray wrapping quotes rather
    // than trusting it never adds them.
    return { status: "success", titleEn: text.replace(/^["'«»]+|["'«».]+$/g, "").trim() };
  } catch (e) {
    console.error("suggestInitiativeTitleEn failed:", e);
    return { status: "error", message: "ai_error" };
  }
}
