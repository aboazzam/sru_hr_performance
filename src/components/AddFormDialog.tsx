"use client";

import { useEffect } from "react";
import { Plus } from "lucide-react";
import type { ReactNode, RefObject } from "react";

/**
 * The one shape every "add X" form on a list screen uses: a trigger button in
 * the screen's own action row, and the form itself inside a modal that ends
 * with its save button.
 *
 * Before this, each list panel rendered its add form permanently underneath
 * the list — so a screen that mostly exists to READ a list opened with a tall
 * empty form in the way (2026-08-20 request: "يكون هناك زر اضافة ... وعند
 * الضغط عليه يظهر النموذج وفي آخره زر الحفظ", applied to every similar form).
 *
 * The dialog is a native `<dialog>` — the pattern already established by
 * NewStrategicPlanForm / AddOrgStructurePositionForm / the Excel import
 * dialogs — so Escape-to-close and a real `::backdrop` come for free.
 *
 * The panel keeps its own `dialogRef` and closes on success rather than this
 * component owning that: the success/error state belongs to the panel's own
 * action, and an error must leave the dialog OPEN with the message inside it.
 */
export function AddFormDialog({
  dialogRef,
  triggerLabel,
  heading,
  subtitle,
  closeLabel,
  children,
  triggerClassName = "sru-btn sru-btn-primary",
  triggerIcon,
  openOnMount = false,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  triggerLabel: string;
  /** Omit when the form already carries its own titled section head. */
  heading?: string;
  subtitle?: string;
  closeLabel: string;
  /** The form itself, ending with its own submit row. */
  children: ReactNode;
  triggerClassName?: string;
  /**
   * Render an icon-only trigger instead of the "+ label" button — used where
   * the action belongs beside a row rather than above a list. The label is
   * still carried by `title`/`aria-label`, so it is never icon-only to a
   * screen reader.
   */
  triggerIcon?: ReactNode;
  /** Open immediately — e.g. arriving from a row's edit icon (?edit=1). */
  openOnMount?: boolean;
}) {
  useEffect(() => {
    if (openOnMount) dialogRef.current?.showModal();
    // Runs once: re-opening on every render would fight the close button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {triggerIcon ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="sru-icon-action"
          title={triggerLabel}
          aria-label={triggerLabel}
        >
          {triggerIcon}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className={triggerClassName}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
        >
          <Plus size={15} aria-hidden />
          {triggerLabel}
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="sru-modal"
        /* A click on the backdrop itself (not on the panel) closes it. */
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            {heading && <h3 style={{ fontSize: 16, fontWeight: 700 }}>{heading}</h3>}
            {subtitle && <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{subtitle}</span>}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="sru-modal-close"
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: heading ? 14 : 4 }}>{children}</div>
      </dialog>
    </>
  );
}
