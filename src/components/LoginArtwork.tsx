/**
 * The decorative panel beside the login form.
 *
 * Drawn here as inline SVG rather than shipped as an image for two reasons:
 * there is no illustration asset in this project to use, and an inline drawing
 * can read its colours from the SRU palette instead of baking a second set of
 * brand colours into a PNG. It is a stylised evaluation board — rows, owners,
 * a completed chip — not a copy of any other product's artwork.
 *
 * `aria-hidden`: it carries no information the form does not already state, so
 * a screen reader should walk straight past it.
 */
export function LoginArtwork() {
  return (
    <svg viewBox="0 0 560 420" role="presentation" aria-hidden focusable="false">
      {/* board */}
      <rect x="60" y="60" width="440" height="300" fill="#ffffff" opacity="0.97" />
      <rect x="60" y="60" width="440" height="52" fill="#f3eefa" />
      <rect x="60" y="96" width="440" height="16" fill="#f3eefa" />

      {/* board title bar */}
      <rect x="88" y="78" width="120" height="12" fill="#501e8c" opacity="0.75" />
      <circle cx="452" cy="84" r="7" fill="#501e8c" opacity="0.18" />
      <circle cx="430" cy="84" r="7" fill="#501e8c" opacity="0.18" />

      {/* rows: owner dot, title bar, two value cells */}
      {[0, 1, 2, 3].map((i) => {
        const y = 140 + i * 52;
        return (
          <g key={i}>
            <circle cx="100" cy={y + 10} r="14" fill={["#501e8c", "#0a6eaa", "#7b3fbf", "#0a6eaa"][i]} opacity="0.85" />
            <rect x="128" y={y + 3} width={[92, 120, 76, 104][i]} height="13" fill="#d9d2e6" />
            <rect x="290" y={y + 3} width="80" height="13" fill="#ece7f4" />
            <rect x="386" y={y + 3} width="80" height="13" fill="#ece7f4" />
          </g>
        );
      })}

      {/* the one finished row, called out */}
      <g>
        <rect x="290" y="195" width="80" height="13" fill="#1f9d55" opacity="0.85" />
        <rect x="386" y="195" width="80" height="13" fill="#1f9d55" opacity="0.3" />
      </g>

      {/* floating "done" chip */}
      <g transform="rotate(-6 452 292)">
        <rect x="392" y="272" width="120" height="40" fill="#1f9d55" />
        <path d="M414 292l7 7 13-14" stroke="#ffffff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="444" y="286" width="48" height="12" fill="#ffffff" opacity="0.9" />
      </g>

      {/* floating owner avatars, echoing the board's people */}
      <g transform="rotate(-8 118 92)">
        <circle cx="118" cy="92" r="42" fill="#7b3fbf" />
        <circle cx="118" cy="80" r="15" fill="#ffffff" opacity="0.92" />
        <path d="M94 118c4-14 12-21 24-21s20 7 24 21z" fill="#ffffff" opacity="0.92" />
      </g>
      <g transform="rotate(7 470 168)">
        <circle cx="470" cy="168" r="42" fill="#0a6eaa" />
        <circle cx="470" cy="156" r="15" fill="#ffffff" opacity="0.92" />
        <path d="M446 194c4-14 12-21 24-21s20 7 24 21z" fill="#ffffff" opacity="0.92" />
      </g>

      {/* progress ring, the shape used all over this app */}
      <g transform="translate(96 300)">
        <circle r="34" fill="#ffffff" />
        <circle r="26" fill="none" stroke="#ece7f4" strokeWidth="8" />
        <circle
          r="26"
          fill="none"
          stroke="#501e8c"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="163"
          strokeDashoffset="46"
          transform="rotate(-90)"
        />
      </g>
    </svg>
  );
}
