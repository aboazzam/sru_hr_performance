/**
 * Print-only header (university logo) and footer (brand band), rendered once
 * from `(app)/layout.tsx` so every page in the app gets the same letterhead
 * on export with no per-page opt-in (2026-08-30: "اعتمد النموذج المرفق
 * للتصدير على بي دي اف في جميع شاشات التطبيق واجعلها موحدة"). `position:
 * fixed` repeats both on every printed page in Chrome, so mounting once at
 * the shell level is enough -- no per-page JSX needed.
 *
 * Assets are cropped directly from the university's real letterhead file
 * (`نموذج خطاب.docx`'s own header/footer image, not the earlier
 * approximation built from the sru-khitab skill's separately-extracted
 * logo/footer crops) -- the logo+divider strip and the divider+solid-purple
 * footer bar, with the wide blank middle of that source image (a near-full-
 * page background picture, logo top-right / large watermark / footer
 * bottom) trimmed out so only the two accent bands remain. The
 * letter-specific contact line (website/email) is whited out of the footer
 * crop -- this isn't correspondence, so it reads oddly on a data export.
 *
 * Sized to stay inside the print stylesheet's existing 16mm page margin
 * (`sru-print.css`, not ours to edit) without any `@page` margin change:
 * the header is a small logo pinned to the physical top-right corner
 * (matching the real letterhead's own layout, not centered), and the
 * footer -- now a thin divider+bar strip rather than the source's much
 * taller full-width band -- naturally spans nearly the full content width
 * at a height that still fits the existing margin.
 *
 * Chrome's OWN header/footer (title/URL, print date, page count) still
 * renders on top of this regardless: that's a print-dialog setting ("More
 * settings" > "Headers and footers") only the person printing controls, not
 * something a web page can suppress.
 */
export function PrintBranding() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- print-only decorative image, not part of the Next.js image pipeline */}
      <img src="/branding/print-header-logo.png" alt="" aria-hidden className="print-only sru-print-header" />
      {/* eslint-disable-next-line @next/next/no-img-element -- print-only decorative image, not part of the Next.js image pipeline */}
      <img src="/branding/print-footer-band.png" alt="" aria-hidden className="print-only sru-print-footer" />
    </>
  );
}
