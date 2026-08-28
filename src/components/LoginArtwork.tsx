/**
 * The illustrated panel beside the login form.
 *
 * Drawn as inline SVG rather than shipped as an image for two reasons: there
 * is no illustration asset in this project to use, and an inline drawing can
 * read the SRU palette instead of baking a second set of brand colours into a
 * PNG.
 *
 * Redrawn 2026-08-29 (requested: "make it fit performance management"). The
 * first version was a generic list-and-avatars board that could have belonged
 * to any product. This one shows what this system actually does, using the
 * same shapes its own screens use:
 *
 *   - an achievement ring with a percentage, the shape /reports and /profile
 *     already use for a score;
 *   - a rising quarterly trend, because performance here is read per cycle;
 *   - a four-level competency scale — the framework's own أساسي→محترف ladder,
 *     with the third level filled;
 *   - an appraisal chip, the moment a cycle is signed off.
 *
 * `aria-hidden`: it carries no information the page does not already state in
 * words, so a screen reader should walk straight past it.
 */
export function LoginArtwork() {
  const purple = "#501e8c";
  const blue = "#0a6eaa";
  const green = "#1f9d55";

  // One quarter per bar: the last is the tallest, and it is the one the
  // trend line lands on.
  const bars = [
    { x: 96, height: 46 },
    { x: 146, height: 68 },
    { x: 196, height: 58 },
    { x: 246, height: 92 },
  ];

  return (
    <svg viewBox="0 34 560 386" role="presentation" aria-hidden focusable="false">
      {/* main card */}
      <rect x="48" y="52" width="464" height="316" rx="18" fill="#ffffff" opacity="0.97" />
      <rect x="48" y="52" width="464" height="56" rx="18" fill="#f3eefa" />
      <rect x="48" y="92" width="464" height="16" fill="#f3eefa" />
      <rect x="78" y="72" width="132" height="14" rx="7" fill={purple} opacity="0.7" />
      <rect x="226" y="72" width="66" height="14" rx="7" fill={blue} opacity="0.35" />

      {/* achievement ring — the score shape used across the app */}
      <g transform="translate(140 214)">
        <circle r="60" fill="#ffffff" />
        <circle r="48" fill="none" stroke="#ece7f4" strokeWidth="14" />
        {/* 78% of the circumference (2πr ≈ 301.6) */}
        <circle
          r="48"
          fill="none"
          stroke={purple}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray="301.6"
          strokeDashoffset="66.4"
          transform="rotate(-90)"
        />
        <text
          x="0"
          y="9"
          textAnchor="middle"
          fontFamily="Cairo, Tahoma, Arial, sans-serif"
          fontSize="30"
          fontWeight="800"
          fill={purple}
        >
          78%
        </text>
      </g>

      {/* quarterly trend: bars rising, with the line landing on the last one */}
      <g transform="translate(140 296)">
        <line x1="82" y1="0" x2="326" y2="0" stroke="#e6e0ef" strokeWidth="2" />
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={-bar.height}
            width="30"
            height={bar.height}
            rx="7"
            fill={bar.x === 246 ? purple : blue}
            opacity={bar.x === 246 ? 0.9 : 0.35}
          />
        ))}
        <polyline
          points="111,-46 161,-68 211,-58 261,-92"
          fill="none"
          stroke={green}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[
          { x: 111, y: -46 },
          { x: 161, y: -68 },
          { x: 211, y: -58 },
        ].map((point) => (
          <circle key={point.x} cx={point.x} cy={point.y} r="4.5" fill={green} />
        ))}
        {/* the final point, called out */}
        <circle cx="261" cy="-92" r="7" fill="#ffffff" stroke={green} strokeWidth="3.5" />
      </g>

      {/* competency ladder: four levels, the third reached */}
      <g transform="translate(96 140)">
        <rect width="132" height="12" rx="6" fill="#ece7f4" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={i * 34} width="30" height="12" rx="6" fill={purple} opacity={0.55 + i * 0.15} />
        ))}
      </g>

      {/* appraisal chip — a cycle signed off */}
      <g transform="rotate(-6 430 132)">
        <rect x="352" y="112" width="156" height="46" rx="12" fill={green} />
        <path
          d="M376 134l8 8 15-16"
          stroke="#ffffff"
          strokeWidth="3.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="410" y="127" width="74" height="14" rx="7" fill="#ffffff" opacity="0.9" />
      </g>

      {/* the person being appraised, and their reviewer */}
      <g transform="rotate(-8 96 84)">
        <circle cx="96" cy="84" r="38" fill="#7b3fbf" />
        <circle cx="96" cy="74" r="13" fill="#ffffff" opacity="0.92" />
        <path d="M75 106c3-12 10-18 21-18s18 6 21 18z" fill="#ffffff" opacity="0.92" />
      </g>
      <g transform="rotate(7 474 300)">
        <circle cx="474" cy="300" r="38" fill={blue} />
        <circle cx="474" cy="290" r="13" fill="#ffffff" opacity="0.92" />
        <path d="M453 322c3-12 10-18 21-18s18 6 21 18z" fill="#ffffff" opacity="0.92" />
        {/* the star a reviewer awards */}
        <path
          d="M474 268l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3-9.3-4.9-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z"
          fill="#f6c343"
        />
      </g>
    </svg>
  );
}
