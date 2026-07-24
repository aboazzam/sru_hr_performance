// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import arMessages from "../../messages/ar.json";
import { OrgStructureSetupWizard } from "./OrgStructureSetupWizard";
import { createLevelsBatch, addPosition } from "@/app/[locale]/(app)/admin/org-structure/actions";

const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/app/[locale]/(app)/admin/org-structure/actions", () => ({
  createLevelsBatch: vi.fn(),
  addPosition: vi.fn(),
}));

const mockCreateLevelsBatch = vi.mocked(createLevelsBatch);
const mockAddPosition = vi.mocked(addPosition);

function renderWizard() {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ OrgStructurePage: arMessages.OrgStructurePage }}>
      <OrgStructureSetupWizard />
    </NextIntlClientProvider>
  );
}

describe("OrgStructureSetupWizard", () => {
  beforeEach(() => {
    cleanup();
    refresh.mockClear();
    mockCreateLevelsBatch.mockReset();
    mockAddPosition.mockReset();
  });

  it("shows the intro empty-state message and a start button", () => {
    renderWizard();
    expect(screen.getByText(arMessages.OrgStructurePage.wizardEmptyTitle)).toBeDefined();
    expect(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardStartButton })).toBeDefined();
  });

  it("walks intro -> count -> positions -> next level -> finish, calling the real actions with the right arguments", async () => {
    mockCreateLevelsBatch.mockResolvedValue({
      status: "success",
      levels: [
        { id: "level-1", name_ar: "المستوى 1", level_order: 1 },
        { id: "level-2", name_ar: "المستوى 2", level_order: 2 },
      ],
    });
    mockAddPosition.mockResolvedValueOnce({ status: "success", positionId: "pos-root" });

    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardStartButton }));

    // Count step: default count is 3, but we asked the mock to return 2 levels
    // regardless — the component must trust whatever the server actually
    // created, not assume its own requested count.
    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardCountNext }));

    await waitFor(() => expect(mockCreateLevelsBatch).toHaveBeenCalledTimes(1));

    // Now on level 1 of 2 (root level — no parent select should render).
    await screen.findByText("المستوى 1 من 2: المستوى 1");
    expect(screen.queryByText(arMessages.OrgStructurePage.positionParentLabel)).toBeNull();

    fireEvent.change(screen.getByLabelText(arMessages.OrgStructurePage.positionNameArLabel), {
      target: { value: "المدير العام" },
    });
    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardAddPositionButton }));

    await waitFor(() =>
      expect(mockAddPosition).toHaveBeenCalledWith("level-1", "المدير العام", "", undefined)
    );
    await screen.findByText("المدير العام");

    // Move to level 2 — a non-root level, so the parent select must appear,
    // pre-populated with the position just created at level 1.
    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardNextLevelButton }));
    await screen.findByText("المستوى 2 من 2: المستوى 2");
    expect(screen.getByText(arMessages.OrgStructurePage.positionParentLabel)).toBeDefined();
    expect(screen.getByRole("option", { name: "المدير العام" })).toBeDefined();

    mockAddPosition.mockResolvedValueOnce({ status: "success", positionId: "pos-child" });
    fireEvent.change(screen.getByLabelText(arMessages.OrgStructurePage.positionNameArLabel), {
      target: { value: "مدير الموارد البشرية" },
    });
    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardAddPositionButton }));

    await waitFor(() =>
      expect(mockAddPosition).toHaveBeenCalledWith("level-2", "مدير الموارد البشرية", "", "pos-root")
    );

    // Last level — "next" becomes "finish", which just refreshes the page
    // (the server component then re-renders with the now-populated data).
    const finishButton = await screen.findByRole("button", { name: arMessages.OrgStructurePage.wizardFinishButton });
    fireEvent.click(finishButton);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces a forbidden error from createLevelsBatch instead of silently advancing", async () => {
    mockCreateLevelsBatch.mockResolvedValue({ status: "error", message: "forbidden" });
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardStartButton }));
    fireEvent.click(screen.getByRole("button", { name: arMessages.OrgStructurePage.wizardCountNext }));

    await screen.findByText(arMessages.OrgStructurePage.errorForbidden);
    // Still on the count step, not silently advanced to "positions".
    expect(screen.getByText(arMessages.OrgStructurePage.wizardCountTitle)).toBeDefined();
  });
});
