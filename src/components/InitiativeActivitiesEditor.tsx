/**
 * One activity of an initiative, as the page hands it to the timeline and to
 * the row actions.
 *
 * This file used to hold an always-open "manage activities" form under the
 * card. That form is gone (2026-08-21 request): adding is now a button on the
 * timeline heading's own row, and each activity carries view / edit / delete
 * icons — both live in `InitiativeActivityActions.tsx`. Only the shared row
 * shape stayed here, since the page and those actions both speak it.
 */
export interface ActivityView {
  id: string;
  titleAr: string;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  /** Ready-to-render label: the written name, the employee's name, or a dash. */
  responsibleLabel: string;
  startDate: string | null;
  endDate: string | null;
}
