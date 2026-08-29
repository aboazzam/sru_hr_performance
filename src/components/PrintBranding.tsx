/**
 * Reusable print-only header (university logo) and footer (brand band) --
 * drop this into any printable page's JSX (anywhere, since both are
 * `position: fixed`) to brand its PDF/print export (2026-08-29: "اجعلها
 * قابلة لإعادة الاستخدام في كل الصفحات"). Assets are the same ones used for
 * official SRU letterhead, with the letter-specific contact line removed
 * from the footer band -- this isn't correspondence, so a website/email
 * line reads oddly on a data export.
 *
 * Both images are sized to sit well inside the print stylesheet's existing
 * 16mm page margin (`sru-print.css`, not ours to edit) rather than the
 * real letterhead's full-bleed footer width -- a full-width band needs a
 * much taller image at that aspect ratio, which would require enlarging
 * the print margin globally and eating into every other page's own
 * already-tuned print density. Kept compact and centered instead, so this
 * has zero effect on any print export that doesn't opt in.
 *
 * `position: fixed` repeats an element on every printed page in Chrome --
 * this is the whole mechanism, no per-page JS involved. Chrome's OWN
 * header/footer (title/URL, print date, page count) still renders on top
 * of this regardless: that's a print-dialog setting ("More settings" >
 * "Headers and footers") only the person printing controls, not something
 * a web page can suppress.
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
