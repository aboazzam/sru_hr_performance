"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  daysInMonth,
  formatDateDmy,
  formatDateValue,
  monthGrid,
  monthNames,
  parseDateParts,
  shiftMonth,
  weekdayNamesShort,
  yearOptions,
} from "@/lib/dateParts";

/**
 * A date control that opens a real CALENDAR, and reads back as
 * `5 أغسطس 2026` — day, month NAME, year.
 *
 * This replaces `<input type="date">` rather than restyling it: a native date
 * input is drawn by the browser in its own locale format (the project owner
 * saw `08 / 09 / 2026`, ambiguous between day-month and month-day) and no CSS
 * or attribute can change that. An earlier version of this component used
 * three selects; choosing a day out of a 31-item dropdown was the part that
 * still read as clumsy, so a day grid replaced it (2026-08-20 request).
 *
 * The value in and out stays `YYYY-MM-DD` (or "" when unset), so every caller
 * and the database keep the exact shape they already used.
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
   * so the control drops into FormData-based forms and plain `method="get"`
   * filter forms exactly like the native input it replaces, with no change to
   * what the server receives.
   */
  name?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const locale = useLocale();
  const names = monthNames(locale);
  const weekdays = weekdayNamesShort(locale);
  const isControlled = value !== undefined;
  const externalValue = isControlled ? value : defaultValue;

  const [internalValue, setInternalValue] = useState(externalValue);
  const [syncedValue, setSyncedValue] = useState(externalValue);
  // A controlled parent can move the value from outside (initial load, or a
  // form resetting after a save); in uncontrolled use `defaultValue` is only
  // a starting point. Adopted during render, never in an effect
  // (react-hooks/set-state-in-effect).
  if (isControlled && value !== syncedValue) {
    setSyncedValue(value);
    setInternalValue(value);
  }
  const current = isControlled ? (value as string) : internalValue;
  const parts = parseDateParts(current);

  const [open, setOpen] = useState(false);
  const today = new Date();
  const [view, setView] = useState<{ year: number; month: number }>(
    parts ? { year: parts.year, month: parts.month } : { year: today.getFullYear(), month: today.getMonth() + 1 }
  );
  // Re-open on the month the value belongs to, not wherever it was left.
  const [viewAnchor, setViewAnchor] = useState(current);
  if (current !== viewAnchor) {
    setViewAnchor(current);
    if (parts) setView({ year: parts.year, month: parts.month });
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popStyle, setPopStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // The popup is position:fixed, so it needs real coordinates. Measured from
  // the trigger each time it opens (and on scroll/resize while open), and
  // flipped above the field when there is no room below.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const POP_W = 274;
      const POP_H = 320;
      const below = window.innerHeight - r.bottom;
      const preferred = below < POP_H && r.top > POP_H ? r.top - POP_H - 6 : r.bottom + 6;
      // Clamped to the viewport: inside a scrolling dialog the field itself can
      // sit past the fold, and anchoring blindly to it would push the calendar
      // off-screen.
      const top = Math.min(Math.max(8, preferred), Math.max(8, window.innerHeight - POP_H - 8));
      // Keep it on screen horizontally whichever direction the page reads.
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - POP_W - 8));
      setPopStyle({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const years = yearOptions(today.getFullYear());
  // A year already stored outside the offered range stays selectable, so an
  // old value is never silently rewritten just by opening the picker.
  if (parts && !years.includes(parts.year)) years.unshift(parts.year);
  if (!years.includes(view.year)) years.unshift(view.year);

  function emit(next: string) {
    if (!isControlled) setInternalValue(next);
    setSyncedValue(next);
    onChange?.(next);
  }

  function pick(day: number) {
    emit(formatDateValue({ year: view.year, month: view.month, day }));
    setOpen(false);
  }

  const weeks = monthGrid(view.year, view.month);
  const todayKey = formatDateValue({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* Carries the same `YYYY-MM-DD` the native input used to submit, so
          FormData-based and plain GET forms need no other change. */}
      {name && <input type="hidden" name={name} value={current} />}

      <button
        ref={triggerRef}
        type="button"
        className="sru-datefield-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={15} aria-hidden />
        <span className={parts ? undefined : "sru-datefield-placeholder"}>
          {parts ? formatDateDmy(current, locale) : locale === "en" ? "Choose a date" : "اختر التاريخ"}
        </span>
        {parts && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label={locale === "en" ? "Clear the date" : "مسح التاريخ"}
            className="sru-datefield-clear"
            onClick={(e) => {
              e.stopPropagation();
              emit("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                emit("");
              }
            }}
          >
            <X size={13} aria-hidden />
          </span>
        )}
      </button>

      {open && !disabled && (
        <div className="sru-datefield-pop" role="dialog" aria-label={ariaLabel} style={popStyle}>
          <div className="sru-datefield-head">
            <button
              type="button"
              className="sru-datefield-nav"
              aria-label={locale === "en" ? "Previous month" : "الشهر السابق"}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
            <div style={{ display: "flex", gap: 6, flex: 1, justifyContent: "center" }}>
              <select
                value={view.month}
                aria-label={locale === "en" ? "Month" : "الشهر"}
                onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
              >
                {names.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
              <select
                value={view.year}
                aria-label={locale === "en" ? "Year" : "السنة"}
                onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="sru-datefield-nav"
              aria-label={locale === "en" ? "Next month" : "الشهر التالي"}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
          </div>

          <table className="sru-datefield-grid">
            <thead>
              <tr>
                {weekdays.map((w) => (
                  <th key={w} scope="col">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((day, di) => {
                    if (day === null) return <td key={di} />;
                    const key = formatDateValue({ year: view.year, month: view.month, day });
                    const selected = key === current;
                    return (
                      <td key={di}>
                        <button
                          type="button"
                          onClick={() => pick(day)}
                          className={
                            selected
                              ? "sru-datefield-day is-selected"
                              : key === todayKey
                                ? "sru-datefield-day is-today"
                                : "sru-datefield-day"
                          }
                          aria-current={selected ? "date" : undefined}
                        >
                          {day}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sru-datefield-foot">
            <button
              type="button"
              className="sru-datefield-quick"
              onClick={() => {
                const y = today.getFullYear();
                const m = today.getMonth() + 1;
                setView({ year: y, month: m });
                emit(formatDateValue({ year: y, month: m, day: Math.min(today.getDate(), daysInMonth(y, m)) }));
                setOpen(false);
              }}
            >
              {locale === "en" ? "Today" : "اليوم"}
            </button>
            <button type="button" className="sru-datefield-quick" onClick={() => setOpen(false)}>
              {locale === "en" ? "Close" : "إغلاق"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
