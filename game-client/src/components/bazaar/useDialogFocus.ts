"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Where focus is, as the trap sees it: a control's index, elsewhere inside, or outside. */
export type FocusPosition = number | "inside" | "outside";

export type FocusTrapStep = { kind: "close" } | { kind: "focus"; index: number } | null;

/**
 * What one key press does inside a modal (design guideline "Modal"): Esc closes; Tab off the
 * last control and Shift+Tab off the first wrap round; Tab from outside the modal (focus that
 * escaped it, say by a click on the page behind) comes back in. Anything else is the browser's.
 */
export function focusTrapStep(
  key: { key: string; shiftKey: boolean },
  active: FocusPosition,
  count: number,
): FocusTrapStep {
  if (key.key === "Escape") return { kind: "close" };
  if (key.key !== "Tab" || count === 0) return null;
  const last = count - 1;
  if (key.shiftKey) {
    return active === 0 || active === "outside" ? { kind: "focus", index: last } : null;
  }
  return active === last || active === "outside" ? { kind: "focus", index: 0 } : null;
}

/**
 * The Bazaar's modal keyboard contract, for the listing dialog and the List-a-relic drawer:
 * focus moves in on open (to `initialFocus` when it matches, else the first control), Tab wraps
 * inside, Esc calls `onClose`, and on close focus goes back to `returnFocus` (else to whatever
 * held it at open), when that is still on the page.
 *
 * The listener is on the document, not the container, so a Tab or Esc still lands when focus
 * has left the container.
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  options: {
    onClose: () => void;
    returnFocus?: RefObject<HTMLElement | null>;
    initialFocus?: string;
  },
): void {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

    const { initialFocus } = latest.current;
    const first = initialFocus ? container.querySelector<HTMLElement>(initialFocus) : null;
    (first ?? controls()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      const nodes = controls();
      const active = document.activeElement;
      const index = nodes.indexOf(active as HTMLElement);
      const position: FocusPosition =
        index >= 0 ? index : container.contains(active) ? "inside" : "outside";
      const step = focusTrapStep(e, position, nodes.length);
      if (!step) return;
      e.preventDefault();
      if (step.kind === "close") latest.current.onClose();
      else nodes[step.index].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const target = latest.current.returnFocus?.current ?? previous;
      if (target?.isConnected) target.focus();
    };
  }, [ref]);
}
