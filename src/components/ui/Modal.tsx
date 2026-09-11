"use client";

import { useEffect, useRef } from "react";

/**
 * A dialog, on the native <dialog> element.
 *
 * showModal() gives focus trapping, Escape-to-close, inert background and the
 * top layer for free — all of which a div-and-a-fixed-overlay has to
 * reimplement, usually badly. The backdrop is styled in globals.css because
 * ::backdrop cannot be reached from a utility class.
 *
 * Why a dialog at all: /admin/clubs put an edit form inside a <details> inside
 * a list item inside another <details>, and at that depth nothing on screen
 * says which form belongs to which club. A dialog answers that by construction
 * — one thing is being edited, its name is in the title, and everything else
 * is out of reach until it closes.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() throws if it is already open, and close() on an already
    // closed dialog fires a spurious `close` event -- so both are guarded.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Escape closes the dialog natively without telling React, so the parent's
    // state would stay `true` and the dialog could never be reopened.
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      // Clicking the backdrop closes it. The check is on the target being the
      // dialog itself: the panel inside is a child, so a click on the form
      // does not bubble up as a backdrop click.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] ${
        size === "lg" ? "max-w-2xl" : "max-w-lg"
      } rounded-panel border border-line bg-surface p-0 shadow-raised backdrop:bg-brand-950/50`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="modal-title" className="font-display text-lg text-ink leading-tight">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press grid size-9 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-canvas hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            className="size-5"
            aria-hidden
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {/* Scrolls inside the dialog rather than the page, so a long form on a
          short screen never strands its own submit button. */}
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}

/**
 * A destructive confirmation.
 *
 * Separate from Modal because the shape is always the same and the stakes are
 * high enough that every one of them should look identical — a delete that
 * looks like an ordinary dialog is a delete somebody clicks through.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  pending = false,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-ink">{body}</p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger-600/20 bg-danger-100 px-3 py-2.5 text-sm text-danger-600"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="press min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-ink-muted hover:bg-canvas"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="press min-h-11 rounded-lg bg-danger-600 px-4 text-sm font-medium text-white hover:bg-danger-600/90 disabled:opacity-60"
        >
          {pending ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
