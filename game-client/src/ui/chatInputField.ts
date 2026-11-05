/**
 * The chat input row's DOM half (FS-WJGFJ R26; FS-J267Q): the text field (`<input>`)
 * alone, as one Phaser DOM element right of the canvas channel picker. A browser field is the
 * only way an input method (Chinese, Japanese, Korean) reaches the game, so the field stays in
 * the DOM; the picker, its divider and the row's ground are drawn on the canvas by `ChatWindow`
 * (a browser element always draws above the canvas, so the picker's list could not open over a
 * DOM picker's neighbours). Kept as thin as it can be: it reports focus, keys and typing to
 * `ChatInput`, which holds every rule, and is checked by eye rather than in a DOM test.
 *
 * Canvas chrome on the DOM, by decision: it wears the game palette like the rest of the chat
 * window, transparent over the near-black input row Phaser draws beneath it (I-WJGFJ-4, -6).
 */

import type Phaser from "phaser";
import type { ChatChannel } from "@/stores/chatStore";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { ChatInputField } from "./chatInput";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_INPUT_HINT,
  chatFieldLabel,
  type Rect,
} from "./chatWindowLayout";

/** What the row tells the chat input. */
export interface ChatInputFieldEvents {
  focused(): void;
  blurred(): void;
  /** `shift`: whether Shift was held (Shift+Tab picks the previous channel). */
  keyDown(key: string, composing: boolean, shift?: boolean): void;
  typed(composing: boolean): void;
}

/** A row the window can place and take down, as well as the input drives it. */
export interface ChatInputFieldHandle extends ChatInputField {
  moveTo(rect: Rect): void;
  /**
   * A browser element always draws above the canvas, so the row is hidden while an overlay owns
   * the keys (the end-of-run card, the gear overlay, a dialogue) and shown again after.
   */
  show(): void;
  hide(): void;
  destroy(): void;
}

export type ChatInputFieldFactory = (
  scene: Phaser.Scene,
  rect: Rect,
  events: ChatInputFieldEvents,
) => ChatInputFieldHandle;

const HUD_DEPTH = 1000;
const FONT = () => `14px ${CANVAS_FONT.body}`;
/**
 * The field's own box: a 14px face needs about 22px for its descenders (g, y, p), and a box left
 * to the inherited line-height cut them off (asked 2026-10-31).
 */
const FIELD_H = "22px";

/** The real row: the text field in Phaser's DOM container, over the input row right of the canvas picker. */
export const domChatInputField: ChatInputFieldFactory = (
  scene,
  rect,
  events,
) => {
  // Phaser owns the outer element's display (it sets block on every render), so the flex row that
  // stretches the field out to the fold button lives one level in, where Phaser never writes
  const shell = document.createElement("div");
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    height: "100%",
  });
  shell.appendChild(row);

  let channel: ChatChannel = "area";
  const showChannel = (c: ChatChannel) => {
    channel = c;
    field.style.color = toCss(CHAT_CHANNEL_COLOUR[c]);
    field.style.caretColor = toCss(CHAT_CHANNEL_COLOUR[c]);
    // the canvas picker is invisible to a screen reader: the field names the channel (FS-J267Q R7)
    field.setAttribute("aria-label", chatFieldLabel(c));
  };

  const field = document.createElement("input");
  field.type = "text";
  field.autocomplete = "off";
  field.spellcheck = false;
  field.placeholder = CHAT_INPUT_HINT;
  field.classList.add("chat-input-field");
  Object.assign(field.style, {
    flex: "1",
    minWidth: "0",
    background: "transparent",
    border: "none",
    outline: "none",
    boxShadow: "none",
    padding: "0",
    margin: "0",
    font: FONT(),
    height: FIELD_H,
    lineHeight: FIELD_H,
  });

  // the placeholder in the system tone: a style rule, since a pseudo-element takes no inline style
  const placeholderStyle = document.createElement("style");
  placeholderStyle.textContent = `.chat-input-field::placeholder { color: ${toCss(palette.chatSystem)}; opacity: 0.7; }`;
  shell.appendChild(placeholderStyle);
  row.append(field);
  // the whole bar is the input: a press on its empty stretch focuses the field too
  shell.addEventListener("pointerdown", (e) => {
    if (e.target === shell || e.target === row) {
      e.preventDefault();
      field.focus();
    }
  });
  showChannel("area");

  const size = (r: Rect) => {
    shell.style.width = `${r.width}px`;
    shell.style.height = `${r.height}px`;
  };
  size(rect);

  // every key stops here: none reaches Phaser's window listener, so typing W never walks and the
  // Enter that sends never reopens the input
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const composing = e.isComposing || e.keyCode === 229;
    // Enter and Esc are the input's; the arrows walk the sent lines, so the caret must not jump;
    // Tab picks a channel (FS-J267Q R5), so the browser must not move focus off the
    // field. Phaser's own capture of Tab never sees this key: it is stopped above, before window
    if (
      !composing &&
      ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab"].includes(e.key)
    )
      e.preventDefault();
    events.keyDown(e.key, composing, e.shiftKey);
  });
  field.addEventListener("keyup", (e) => e.stopPropagation());
  field.addEventListener("input", (e) =>
    events.typed((e as InputEvent).isComposing === true),
  );
  field.addEventListener("compositionend", () => events.typed(false));
  field.addEventListener("focus", () => events.focused());
  field.addEventListener("blur", () => events.blurred());
  const dom = scene.add
    .dom(rect.x, rect.y, shell)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(HUD_DEPTH);

  return {
    get value() {
      return field.value;
    },
    set value(v: string) {
      field.value = v;
    },
    get channel() {
      return channel;
    },
    set channel(c: ChatChannel) {
      showChannel(c);
    },
    focus: () => field.focus(),
    blur: () => field.blur(),
    moveTo: (r) => {
      dom.setPosition(r.x, r.y);
      size(r);
    },
    // Phaser applies a DOM element's visibility on its next render, so the node's own display is
    // set here as well: a focus() right after show() must find the field already shown
    show: () => {
      dom.setVisible(true);
      shell.style.display = "block";
    },
    hide: () => {
      dom.setVisible(false);
      shell.style.display = "none";
    },
    destroy: () => dom.destroy(),
  };
};
