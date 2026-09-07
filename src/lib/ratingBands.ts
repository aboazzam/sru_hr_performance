/**
 * Rating bands for the "نتائج التقييم" (Evaluation Results) module — a
 * presentational classification over the weighted score already computed by
 * `weightedCycleScore()` (evaluationCycle.ts), not a new stored fact.
 *
 * No official rating-band scale existed anywhere in this project's
 * documented sources (CLAUDE.md, SRU_System_Design.md) before this module —
 * these five bands were proposed as clean round-number cutoffs with NO
 * compensation/bonus/merit percentage attached (that remains a separate,
 * undecided HR policy matter this module does not invent), and confirmed
 * directly with the project owner (2026-09-08: "اعتمد فئات التقييم الخمس
 * كما هي"). Revising the bands later is still a one-file edit — nothing
 * else in this module stores a band, everything re-derives it from the
 * score on read.
 */

export type RatingBandId = "excellent" | "veryGood" | "good" | "satisfactory" | "needsImprovement";

export interface RatingBand {
  id: RatingBandId;
  labelAr: string;
  /** Inclusive. */
  min: number;
  /** Inclusive — 100 for the top band. */
  max: number;
}

/** Ordered high-to-low, matching how the dashboard/distribution lists them. */
export const RATING_BANDS: readonly RatingBand[] = [
  { id: "excellent", labelAr: "ممتاز", min: 90, max: 100 },
  { id: "veryGood", labelAr: "جيد جدًا", min: 80, max: 89 },
  { id: "good", labelAr: "جيد", min: 70, max: 79 },
  { id: "satisfactory", labelAr: "مقبول", min: 60, max: 69 },
  { id: "needsImprovement", labelAr: "يحتاج تحسين", min: 0, max: 59 },
];

/**
 * Never invents a band for a score that does not exist — `null`/`NaN` input
 * returns `null`, the same never-fabricate discipline `weightedCycleScore`
 * already follows for a missing method (excluded, not zeroed).
 *
 * `weightedCycleScore` returns a float average, not an integer, so matching
 * must not check `band.max` (a gap like 89 < score < 90 would otherwise fall
 * between "veryGood" and "excellent" and match nothing) — `RATING_BANDS` is
 * ordered highest-min-first, so taking the first band whose `min` the score
 * clears is enough; the bottom band's `min: 0` guarantees every real number
 * from 0 up matches something. `max` stays on the type purely for display
 * ("٧٠–٧٩٪" style ranges), not for this comparison.
 */
export function bandForScore(score: number | null | undefined): RatingBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  return RATING_BANDS.find((band) => score >= band.min) ?? null;
}
