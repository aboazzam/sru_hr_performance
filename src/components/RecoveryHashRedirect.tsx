"use client";

import { useEffect } from "react";

/**
 * Supabase's password-recovery link redirects to the project's Site URL
 * (currently just the bare domain, no path) rather than honoring our
 * requestPasswordReset's redirectTo -- confirmed as a Supabase-side
 * Redirect URLs issue (even a trivial unrelated path gets stripped, not
 * specific to our own path), independent of app code. The recovery token
 * itself lives in the URL hash fragment, which is never sent to the
 * server and survives every redirect the browser follows regardless of
 * where Supabase lands it. This runs on every page, catches that hash,
 * and moves the user to /reset-password while preserving it -- sidesteps
 * the redirect_to problem entirely rather than waiting on it to be fixed.
 */
export function RecoveryHashRedirect({ locale }: { locale: string }) {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") && !window.location.pathname.endsWith("/reset-password")) {
      window.location.replace(`/${locale}/reset-password${hash}`);
    }
  }, [locale]);

  return null;
}
