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
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
