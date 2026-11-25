/**
 * The link press (FS-KBA4Q R1): a left-press with Ctrl and Alt, or Meta and Alt, both held; on a
 * Mac, Control+Option and Cmd+Option. Both are taken on every platform, with no OS detection, and
 * Shift's state does not matter. The modifiers are read from the press's own DOM event (Phaser's
 * `Pointer#event`, the native event the pointer last processed), never from a Phaser key, so they
 * read true while the game's keyboards are off for typing.
 */

/** What of a Phaser pointer a link press is read from. */
export interface PressedPointer {
  button?: number;
  event?: unknown;
}

/** Whether the link modifiers were held as the pointer's event fired, whichever button it was (R6). */
export function linkModifiersHeld(pointer: PressedPointer): boolean {
  const event = pointer.event as Partial<Pick<MouseEvent, "ctrlKey" | "altKey" | "metaKey">> | null | undefined;
  if (!event) return false;
  return !!event.altKey && (!!event.ctrlKey || !!event.metaKey);
}

/** Whether a press is a link press: the left button with the link modifiers held (R1). */
export function isLinkPress(pointer: PressedPointer): boolean {
  return pointer.button === 0 && linkModifiersHeld(pointer);
}
