import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Cookie handling is automatic
 * (falls back to `document.cookie`) — do not pass a custom `cookies` option
 * unless a non-default cookie store is genuinely needed.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
