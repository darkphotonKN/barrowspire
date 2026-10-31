/**
 * The chat input's rules (FS-WJGFJ R26–R28), apart from any scene or DOM: when it may open, what
 * opening does to the scene's keyboard, what Enter and Esc do, and how long a line may be. The
 * text field is a thin DOM adapter (`chatEntryField.ts`) that reports focus, keys and typing here.
 *
 * Exactly one thing owns Enter and Esc at a time (R27): the scene says through `mayOpen` whether
 * a dialogue, a menu or an overlay holds them; while the input is open the scene's keyboard is
 * off, so nothing else hears them.
 */

/** The most code points a line may carry, as the server counts them (R5, R26). */
export const CHAT_TEXT_MAX = 200;

/** A line cut to `CHAT_TEXT_MAX` code points, so an emoji counts as the server counts it. */
export function clampChatText(text: string): string {
  const points = Array.from(text);
  return points.length <= CHAT_TEXT_MAX
    ? text
    : points.slice(0, CHAT_TEXT_MAX).join("");
}

/** The text field as the input drives it. */
export interface ChatEntryField {
  value: string;
  focus(): void;
  blur(): void;
}

/** The part of a scene's keyboard plugin the input switches off while the player types. */
export interface SceneKeyboard {
  enabled: boolean;
  resetKeys(): void;
}

/** What a sent line carries: in this slice always the area channel (R28). */
export interface ChatSend {
  channel: "area";
  text: string;
}

export interface ChatInputDeps {
  field: ChatEntryField;
  keyboard: () => SceneKeyboard | null | undefined;
  /** Whether nothing else owns Enter and Esc right now (R27). */
  mayOpen: () => boolean;
  send: (line: ChatSend) => void;
  /** Told whenever the open state or the draft changes, so the window can redraw its hint. */
  changed?: () => void;
}

export class ChatInput {
  private open = false;
  /** The keyboard's state when the input opened, put back as it was when it closes. */
  private keyboardWasEnabled = true;

  constructor(private readonly deps: ChatInputDeps) {}

  isOpen(): boolean {
    return this.open;
  }

  /** Enter in the scene, or a click on the field: focuses the field if nothing else owns the keys. */
  requestOpen(): boolean {
    if (this.open || !this.deps.mayOpen()) return false;
    this.deps.field.focus();
    return true;
  }

  /** The field took focus, by Enter or by a click: the player is typing now (R26). */
  focused(): void {
    if (this.open) return;
    if (!this.deps.mayOpen()) {
      this.deps.field.blur();
      return;
    }
    this.open = true;
    const keyboard = this.deps.keyboard();
    if (keyboard) {
      this.keyboardWasEnabled = keyboard.enabled;
      // a key held as the input opened would otherwise stay down, and an Enter latched for a
      // menu would answer it the next time it opened
      keyboard.resetKeys();
      keyboard.enabled = false;
    }
    this.deps.changed?.();
  }

  /** The field lost focus: the input closes, the draft stays for the next open. */
  blurred(): void {
    if (!this.open) return;
    this.open = false;
    const keyboard = this.deps.keyboard();
    if (keyboard) keyboard.enabled = this.keyboardWasEnabled;
    this.deps.changed?.();
  }

  /**
   * A key in the open field. Enter sends what is typed and closes; Enter on nothing just closes;
   * Esc closes and throws the draft away (R26). While an input method is composing, Enter is its
   * own (picking a character) and never sends.
   */
  keyDown(key: string, composing: boolean): void {
    if (!this.open || composing) return;
    if (key === "Enter") {
      const text = clampChatText(this.deps.field.value.trim());
      if (text) this.deps.send({ channel: "area", text });
      this.discardAndClose();
    } else if (key === "Escape") {
      this.discardAndClose();
    }
  }

  /** The draft changed: cut it to the limit once the input method has committed, never mid-pick. */
  typed(composing: boolean): void {
    if (composing) return;
    const clamped = clampChatText(this.deps.field.value);
    if (clamped !== this.deps.field.value) this.deps.field.value = clamped;
    this.deps.changed?.();
  }

  /** The scene takes the keys back (the end-of-run overlay): close and drop the draft (R27). */
  cancel(): void {
    if (this.open) this.discardAndClose();
    else this.deps.field.value = "";
  }

  private discardAndClose(): void {
    this.deps.field.value = "";
    this.deps.field.blur();
    this.blurred();
  }
}
