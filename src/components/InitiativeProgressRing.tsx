"use client";

import { useTranslations } from "next-intl";
import type { InitiativeProgress } from "@/lib/initiativeProgress";

/**
 * The donut on an initiative card.
 *
 * Drawn as plain SVG rather than pulling in a chart library: it is one arc,
 * and Recharts (the project's charting dependency) would cost a client bundle
 * for a shape that is four lines of geometry.
 *
 * The caption under it names the SOURCE of the number — reported completion,
 * a done status, or merely elapsed time — because a bare percentage on a card
 * reads as "work finished" whichever of the three produced it.
 */
export function InitiativeProgressRing({
  progress,
  size = 76,
}: {
  progress: InitiativeProgress;
  size?: number;
}) {
  const t = useTranslations("InitiativesPanel");
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (progress.percent / 100) * circumference;

  const color =
    progress.kind === "none"
      ? "var(--sru-border, #e5e7eb)"
      : progress.kind === "elapsed"
        ? "var(--sru-blue, #1f7ae0)"
        : "var(--sru-purple)";

  const captionKey =
    progress.kind === "reported"
      ? "progressReported"
      : progress.kind === "status"
        ? "progressFromStatus"
        : progress.kind === "elapsed"
          ? "progressElapsed"
          : "progressUnknown";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: size }}>
      <svg width={size} height={size} role="img" aria-label={`${progress.percent}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--sru-border, #e5e7eb)"
          strokeWidth={stroke}
        />
        {progress.kind !== "none" && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            /* Start at 12 o'clock and run clockwise. */
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: size / 4, fontWeight: 700, fill: progress.kind === "none" ? "var(--sru-muted)" : color }}
        >
          {progress.kind === "none" ? "—" : `${progress.percent}%`}
        </text>
      </svg>
      <span style={{ fontSize: 10, color: "var(--sru-muted)", textAlign: "center", lineHeight: 1.4 }}>
        {t(captionKey)}
      </span>
    </div>
  );
}
