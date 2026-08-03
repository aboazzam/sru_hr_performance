/**
 * Every live-search box in this app matches by plain substring, which fails
 * the moment a query's hamza form doesn't byte-match the stored data's
 * (e.g. searching "احمد" against a stored "أحمد", or "استاذ" against
 * "أستاذ") -- a real, explicitly reported gap ("اريدك ان تهمل الهمزة سواء
 * استخدمها المستخدم ام لا" -- ignore the hamza whether the user typed it or
 * not). Normalizing every hamza-bearing letter down to its bare form before
 * comparing (on both the query and the haystack) makes the match
 * hamza-insensitive in both directions, without touching any other
 * character (no broader Arabic normalization -- e.g. ta marbuta/alef
 * maksura -- was asked for, so none is applied here).
 */
export function foldArabicHamza(text: string): string {
  return text.replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "");
}

/** True if `haystack` contains `needle` once both are hamza-folded. */
export function includesIgnoringHamza(haystack: string, needle: string): boolean {
  return foldArabicHamza(haystack).includes(foldArabicHamza(needle));
}
