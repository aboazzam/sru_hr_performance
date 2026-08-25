import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers required by CLAUDE.md §5-A and SECURITY_CHECKLIST.md §6.2.
// Content-Security-Policy is deliberately NOT included here — the checklist
// itself (§2.5) flags CSP as needing careful, deliberate testing before
// activation since it can break inline styles; it's a separate task, not a
// drop-in header.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const nextConfig: NextConfig = {
  // "الخطة التنفيذية" became "الخطة التشغيلية" on 2026-08-25, and the route
  // moved with it. Anyone holding a link to the old path — a bookmark, a
  // message, a printed plan — still lands on the right screen. Permanent, so
  // browsers and search stop asking.
  async redirects() {
    return [
      { source: "/:locale/executive-plans", destination: "/:locale/operational-plans", permanent: true },
      { source: "/:locale/executive-plans/:path*", destination: "/:locale/operational-plans/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
