import { routing } from "./routing";

export const locales = routing.locales;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = routing.defaultLocale;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDir(locale: Locale) {
  return locale === "ar" ? "rtl" : "ltr";
}
