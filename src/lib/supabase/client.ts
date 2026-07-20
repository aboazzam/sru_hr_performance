import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Cookie handling is automatic
 * (falls back to `document.cookie`) — do not pass a custom `cookies` option
 * unless a non-default cookie store is genuinely needed.
 *
 * Do NOT try to pass `auth.flowType` here to get implicit-grant recovery
 * links working — `@supabase/ssr`'s own `createBrowserClient` (v0.12.3,
 * latest as of this writing) spreads `options.auth` and THEN hardcodes
 * `flowType: "pkce"` unconditionally afterward in the same object literal,
 * silently discarding any override. Confirmed by reading
 * node_modules/@supabase/ssr/dist/main/createBrowserClient.js directly,
 * and by reproducing the exact `AuthPKCEGrantCodeExchangeError: Not a
 * valid PKCE flow url.` even with `flowType: "implicit"` passed in. See
 * `ResetPasswordForm.tsx` for the actual fix (manual `setSession()`,
 * which has no flow-type dependency at all).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
