// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { PrintButton } from "./PrintButton";

function renderWithLocale(locale: "ar" | "en", printLabel: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ PrintButton: { print: printLabel } }}>
      <PrintButton />
    </NextIntlClientProvider>
  );
}

describe("PrintButton", () => {
  beforeEach(() => {
    cleanup();
    window.print = vi.fn();
  });

  it("renders the translated Arabic label", () => {
    renderWithLocale("ar", "طباعة");
    expect(screen.getByRole("button", { name: "طباعة" })).toBeDefined();
  });

  it("renders the translated English label (proves the label isn't hardcoded)", () => {
    renderWithLocale("en", "Print");
    expect(screen.getByRole("button", { name: "Print" })).toBeDefined();
  });

  it("calls window.print() when clicked", () => {
    renderWithLocale("ar", "طباعة");
    const button = screen.getByRole("button", { name: "طباعة" });
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("carries the no-print class so it's hidden by sru-print.css's @media print rule", () => {
    renderWithLocale("ar", "طباعة");
    const button = screen.getByRole("button", { name: "طباعة" });
    expect(button.className).toContain("no-print");
    expect(button.className).toContain("sru-print-btn");
  });
});
