/**
 * The options every Excel import now carries, shared so the five importers
 * behave identically instead of each inventing its own rules.
 *
 * Asked for on 2026-08-24: before an import runs, the caller chooses whether
 * it may touch rows that already exist, which of the file's columns map to
 * which platform field, and which fields are actually written.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DEFAULT IS "ADD ONLY"
 * ---------------------------------------------------------------------------
 * Every importer here used to update existing rows unconditionally — a second
 * upload of the same file silently rewrote live records. The requested dialog
 * preselects "add the new ones only", and that is the safer default, so it is
 * the default here too. This IS a behaviour change: a caller who wants the old
 * behaviour now has to say so, in a dialog that spells out what it does.
 *
 * ---------------------------------------------------------------------------
 * WHAT IMPORT NEVER DOES
 * ---------------------------------------------------------------------------
 * Neither mode deletes anything. A row missing from the file is left alone,
 * not removed — deleting people or postings by omission would destroy their
 * history, and the dialog says so rather than leaving it to be discovered.
 */
export type ImportMode = "insert_only" | "upsert";

export const IMPORT_MODES: readonly ImportMode[] = ["insert_only", "upsert"] as const;

export function isImportMode(value: unknown): value is ImportMode {
  return value === "insert_only" || value === "upsert";
}

export interface ImportOptions {
  mode: ImportMode;
  /**
   * Canonical field keys the caller ticked. `null` means "the caller said
   * nothing", which keeps every field writable — so an import link built
   * before this dialog existed behaves as it always did.
   */
  fields: ReadonlySet<string> | null;
  /** File column label -> canonical field key. Empty when nothing was remapped. */
  mapping: ReadonlyMap<string, string>;
}

function parseList(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
}

export function parseImportOptions(formData: FormData): ImportOptions {
  const rawMode = formData.get("importMode");
  const mode: ImportMode = isImportMode(rawMode) ? rawMode : "insert_only";

  const fieldList = parseList(formData.get("importFields"));

  const mapping = new Map<string, string>();
  const rawMapping = formData.get("importMapping");
  if (typeof rawMapping === "string" && rawMapping.trim() !== "") {
    try {
      const parsed = JSON.parse(rawMapping) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [column, field] of Object.entries(parsed as Record<string, unknown>)) {
          // "" is how the dialog says "ignore this column" — carrying it into
          // the map would create a field named "".
          if (typeof field === "string" && field !== "") mapping.set(column, field);
        }
      }
    } catch {
      // A malformed mapping is treated as no mapping rather than failing the
      // whole import: the file's own headers still resolve by exact name.
    }
  }

  return { mode, fields: fieldList == null ? null : new Set(fieldList), mapping };
}

/** Whether a canonical field may be written at all. */
export function writesField(options: ImportOptions, field: string): boolean {
  return options.fields == null || options.fields.has(field);
}

/** Whether rows that already exist may be touched. */
export function updatesExisting(options: ImportOptions): boolean {
  return options.mode === "upsert";
}

/**
 * Rewrites a file's header row into canonical field names.
 *
 * The importers all resolve columns by their Arabic label, so honouring the
 * caller's mapping is a translation step in ONE place rather than a change
 * inside each of them: a column the caller mapped is renamed to the canonical
 * label, a column they left on "ignore" is dropped, and anything they did not
 * touch keeps whatever name the file gave it (so an already-correct file needs
 * no mapping at all).
 *
 * `columnLabels` maps canonical key -> the label that importer expects.
 */
export function applyMapping(
  fileHeaders: ReadonlyMap<string, number>,
  options: ImportOptions,
  columnLabels: Readonly<Record<string, string>>
): Map<string, number> {
  if (options.mapping.size === 0) return new Map(fileHeaders);

  const resolved = new Map<string, number>();
  for (const [fileColumn, columnNumber] of fileHeaders) {
    const mappedField = options.mapping.get(fileColumn);
    if (mappedField == null) {
      // Not mentioned by the dialog at all: keep it as-is.
      if (!resolved.has(fileColumn)) resolved.set(fileColumn, columnNumber);
      continue;
    }
    const label = columnLabels[mappedField];
    if (label == null) continue;
    // First mapping wins, so two columns pointed at one field cannot make the
    // later one silently replace the earlier.
    if (!resolved.has(label)) resolved.set(label, columnNumber);
  }
  return resolved;
}
