"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * The authenticated app shell had NO error boundary anywhere -- confirmed by
 * grepping for error.tsx/global-error.tsx across the whole app (zero
 * matches) -- so any uncaught client-side render exception (e.g. a stale
 * Server Action reference after a redeploy, per Next.js's own
 * "Failed to find Server Action ID... this request might be from an older
 * or newer deployment" failure mode) fell straight through to Next's default
 * production fallback, which renders as an essentially blank page (2026-08:
 * reported live -- submitting /employees/new right after a fresh redeploy
 * showed a blank white page at the same URL, no error text at all).
 *
 * `reset()` alone re-renders the segment without a real page reload, which
 * does NOT fetch a fresh JS bundle -- useless for the stale-deployment case
 * that's the most likely real trigger. The reload button forces a full
 * navigation instead, which is the only thing that actually recovers from
 * that scenario.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("AppErrorBoundary");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 16px" }}>
      <div className="sru-card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "color-mix(in srgb, var(--sru-danger, #b91c1c) 12%, #fff)",
            color: "var(--sru-danger, #b91c1c)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <AlertTriangle size={24} aria-hidden />
        </div>
        <h2 style={{ margin: "0 0 8px" }}>{t("title")}</h2>
        <p style={{ margin: "0 0 24px", color: "var(--sru-muted)" }}>{t("description")}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="sru-btn sru-btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={15} aria-hidden />
            {t("reloadButton")}
          </button>
          <button type="button" className="sru-btn" onClick={() => reset()}>
            {t("retryButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
