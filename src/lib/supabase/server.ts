import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Create a new instance per request — never share one across requests (see
 * @supabase/ssr's own createServerClient docs).
 *
 * `setAll` is wrapped in try/catch because Server Components cannot set
 * cookies at all (only Server Actions/Route Handlers can) — this is safe to
 * ignore there as long as `src/proxy.ts` refreshes the session on every
 * request, which it does.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — no-op, src/proxy.ts
            // already refreshes the session for the next request.
          }
        },
      },
    }
  );
}
