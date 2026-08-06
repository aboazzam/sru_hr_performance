"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import {
  daysInMonth,
  formatDateValue,
  monthNames,
  parseDateParts,
  yearOptions,
} from "@/lib/dateParts";

/**
 * A date control that shows the month as a NAME — `03 / أكتوبر / 2026` —
 * instead of the browser's own `08 / 09 / 2026`, which is ambiguous between
 * day-month and month-day order.
 *
 * This is a replacement for `<input type="date">`, not a restyling of it: a
 * native date input is drawn by the browser in its own locale format, and no
 * CSS or attribute can change that. Three selects also make an impossible
 * date unreachable, and the day list re-lengths with the chosen month (31
 * disappears when September is picked, and the value clamps rather than
 * silently becoming invalid).
 *
 * The value in and out stays `YYYY-MM-DD` (or "" when incomplete), so callers
 * and the database keep the exact shape they already use.
 */
export function DateFieldDmy({
  value,
  onChange,
  defaultValue = "",
  name,
  disabled = false,
  ariaLabel,
}: {
  /** Controlled use: pass both `value` and `onChange`. */
  value?: string;
  onChange?: (nextValue: string) => void;
  /** Uncontrolled use (plain `name`-based forms): the starting value. */
  defaultValue?: string;
  /**
   * When set, a hidden input carries the `YYYY-MM-DD` value under this name —
   * so the control drops into FormData-based forms (employee invite/edit) and
   * plain `method="get"` filter forms exactly like the native input it
   * replaces, with no change to what the server receives.
   */
  name?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const locale = useLocale();
  const names = monthNames(locale);
  const isControlled = value !== undefined;
  const externalValue = isControlled ? value : defaultValue;

  // The parts live in local state, NOT derived from `value` alone. Found live:
  // deriving them purely from the prop makes a date impossible to enter —
  // choosing the day emits "" (still incomplete), the parent stores "", and
  // the next render forgets the day that was just chosen, so the three parts
  // can never accumulate. Local state holds the in-progress entry; `value`
  // still wins whenever the parent changes it from outside (initial load, or
  // the form resetting after a save).
  const initial = parseDateParts(externalValue);
  const [draft, setDraft] = useState({
    day: initial?.day ?? 0,
    month: initial?.month ?? 0,
    year: initial?.year ?? 0,
  });
  const [syncedValue, setSyncedValue] = useState(externalValue);
  // Only a controlled parent can move the value from outside; in uncontrolled
  // use `defaultValue` is a starting point, not a continuing source of truth.
  if (isControlled && value !== syncedValue) {
    setSyncedValue(value);
    const incoming = parseDateParts(value);
    // Adopt a real external value; ignore the "" this component itself emits
    // while the entry is still incomplete, which would otherwise wipe the draft.
    if (incoming) setDraft(incoming);
    else if (draft.day && draft.month && draft.year) setDraft({ day: 0, month: 0, year: 0 });
  }

  const currentYear = new Date().getFullYear();
  const years = yearOptions(currentYear);
  // Years already stored outside the offered range must stay selectable, so an
  // old value is never silently rewritten just by opening the form.
  if (draft.year && !years.includes(draft.year)) years.unshift(draft.year);

  const { day, month, year } = draft;

  // 31 while the month is unknown, so every day stays reachable before a month
  // is chosen; afterwards the list matches the real month length.
  const dayCount = month && year ? daysInMonth(year, month) : 31;

  function emit(next: { day?: number; month?: number; year?: number }) {
    const candidate = { day, month, year, ...next };
    // Clamp the kept draft too, so switching to a shorter month leaves the day
    // select showing what will actually be saved (31 Jan -> Sep becomes 30).
    if (candidate.day && candidate.month && candidate.year) {
      candidate.day = Math.min(candidate.day, daysInMonth(candidate.year, candidate.month));
    }
    setDraft(candidate);
    setSyncedValue(formatDateValue(candidate));
    // A part still unchosen (or cleared back to "—") means no date yet: the
    // parent gets "", never a half-set value.
    onChange?.(formatDateValue(candidate));
  }

  const isoValue = formatDateValue(draft);

  const selectStyle: React.CSSProperties = { minWidth: 0 };

  return (
    <div
      style={{ display: "flex", gap: 6, alignItems: "center" }}
      role="group"
      aria-label={ariaLabel}
    >
      {/* Carries the same `YYYY-MM-DD` the native input used to submit, so
          FormData-based and plain GET forms need no other change. */}
      {name && <input type="hidden" name={name} value={isoValue} />}
      <select
        value={day || ""}
        disabled={disabled}
        onChange={(e) => emit({ day: Number(e.target.value) })}
        aria-label={ariaLabel ? `${ariaLabel} — day` : "day"}
        style={{ ...selectStyle, flex: "0 0 auto" }}
      >
        <option value="">—</option>
        {/* Unpadded, matching how the value reads back: `5 أغسطس 2026`. */}
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        value={month || ""}
        disabled={disabled}
        onChange={(e) => emit({ month: Number(e.target.value) })}
        aria-label={ariaLabel ? `${ariaLabel} — month` : "month"}
        style={{ ...selectStyle, flex: "1 1 auto" }}
      >
        <option value="">—</option>
        {names.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>

      <select
        value={year || ""}
        disabled={disabled}
        onChange={(e) => emit({ year: Number(e.target.value) })}
        aria-label={ariaLabel ? `${ariaLabel} — year` : "year"}
        style={{ ...selectStyle, flex: "0 0 auto" }}
      >
        <option value="">—</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
