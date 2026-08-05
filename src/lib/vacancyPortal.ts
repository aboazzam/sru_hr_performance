/**
 * Whether an advertised vacancy is currently live on "بوابة التوظيف".
 *
 * The portal shows an ad only when its time has come: from
 * `announcement_start_date` (or, when that is not set, from the moment it was
 * advertised) until `application_deadline` (or forever, when that is not set).
 *
 * A vacancy that is no longer `open` is deliberately NOT shown on the portal
 * even inside its window — the portal is the outward-facing list, and
 * advertising a filled or closed post to applicants would be misleading.
 * The management tab keeps showing it with this exact state, so it is always
 * visible WHY an ad is not live rather than silently vanishing.
 */
export const portalStates = ["live", "scheduled", "expired", "not_open"] as const;
export type PortalState = (typeof portalStates)[number];

export const portalStateLabels: Record<PortalState, string> = {
  live: "منشور في البوابة",
  scheduled: "لم يبدأ النشر بعد",
  expired: "انتهى موعد التقديم",
  not_open: "الشاغر غير مفتوح",
};

export interface VacancyAnnouncementWindow {
  status: string;
  /** ISO timestamp of when it was advertised; null = not advertised at all. */
  announcedAt: string | null;
  /** YYYY-MM-DD, or null to fall back to the announcement date. */
  announcementStartDate: string | null;
  /** YYYY-MM-DD, or null for an open-ended ad. */
  applicationDeadline: string | null;
}

/**
 * `today` is YYYY-MM-DD in the configured display timezone, and the dates are
 * plain `date` columns — so everything is compared as strings, never through
 * `new Date(iso)`, which is where this project already hit a real
 * off-by-one-day bug. Both ends are inclusive: an ad is live on its own start
 * day and on its deadline day.
 */
export function vacancyPortalState(
  vacancy: VacancyAnnouncementWindow,
  today: string
): PortalState {
  if (vacancy.status !== "open") return "not_open";

  const start = vacancy.announcementStartDate ?? isoDatePart(vacancy.announcedAt);
  if (start && today < start) return "scheduled";
  if (vacancy.applicationDeadline && today > vacancy.applicationDeadline) return "expired";
  return "live";
}

/** The YYYY-MM-DD part of an ISO timestamp, without constructing a Date. */
export function isoDatePart(iso: string | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match ? match[1] : null;
}
