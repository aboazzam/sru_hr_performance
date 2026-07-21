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
 *
 * Also catches `type=invite` -- inviteUserByEmail's accept link produces the
 * exact same hash shape (access_token/refresh_token/type), and this was
 * missing entirely until a real invite link was tested end-to-end: it
 * landed on the bare domain with a valid, unconsumed session in the hash
 * and nothing ever read it, silently stranding the invited user with no
 * way to set their initial password. ResetPasswordForm already handles
 * both types identically (setSession() doesn't care which flow produced
 * the tokens), so no new page was needed -- just recognizing this hash
 * shape here too.
 */
export function RecoveryHashRedirect({ locale }: { locale: string }) {
  useEffect(() => {
    const hash = window.location.hash;
    if (
      (hash.includes("type=recovery") || hash.includes("type=invite")) &&
      !window.location.pathname.endsWith("/reset-password")
    ) {
      window.location.replace(`/${locale}/reset-password${hash}`);
    }
  }, [locale]);

  return null;
}
