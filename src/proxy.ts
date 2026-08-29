import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/**
 * Wraps next-intl's locale routing with a Supabase session refresh, per
 * @supabase/ssr's documented middleware pattern (see
 * node_modules/@supabase/ssr/dist/module/types.d.ts's SetAllCookies comment).
 * Skipping this causes random logouts / early session termination — Server
 * Components can read cookies but cannot write them, so the session's
 * refreshed access/refresh tokens can only be persisted here.
 */
export async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    }
  );

  // getUser() (not getSession()) — contacts the Auth server so the token
  // refresh actually happens here, not just a read of a possibly-stale cookie.
  //
  // A refresh token that's gone stale (expired, already rotated by a
  // concurrent request, or invalidated elsewhere) makes the underlying
  // GoTrue client THROW rather than return {error} — confirmed live in
  // production stderr ("AuthApiError: Invalid Refresh Token: Refresh Token
  // Not Found"). Uncaught, that crashes this entire middleware for EVERY
  // route the matcher covers, before Next.js's own page rendering — and any
  // error.tsx boundary — ever runs. This was the real cause of a reported
  // blank page on /employees/new that no error boundary could catch (2026-08).
  // A failed refresh here just means the request continues unauthenticated;
  // the downstream (app)/layout.tsx auth gate already redirects to /login
  // for that case, so swallowing this is safe.
  try {
    await supabase.auth.getUser();
  } catch {
    // See comment above.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
