/**
 * The chat input's text field (FS-WJGFJ R26): a real `<input>` placed over the window's input row
 * as a Phaser DOM element, because only a browser field takes an input method (Chinese, Japanese,
 * Korean), paste and caret keys. Kept as thin as it can be: it reports focus, keys and typing to
 * `ChatInput`, which holds every rule, and is tested by eye rather than in a DOM test.
 *
 * Canvas chrome on the DOM, by decision: it wears the game palette like the rest of the chat
 * window, transparent over the panel Phaser draws beneath it (FS-WJGFJ R30; I-WJGFJ-4).
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { ChatEntryField } from "./chatInput";
import { CHAT_INPUT_TEXT_X, type Rect } from "./chatWindowLayout";

/** What the field tells the chat input. */
export interface ChatEntryEvents {
  focused(): void;
  blurred(): void;
  keyDown(key: string, composing: boolean): void;
  typed(composing: boolean): void;
}

/** A field the window can place and take down, as well as the input drives it. */
export interface ChatEntryHandle extends ChatEntryField {
  moveTo(rect: Rect): void;
  destroy(): void;
}

export type ChatEntryFactory = (
  scene: Phaser.Scene,
  rect: Rect,
  events: ChatEntryEvents,
) => ChatEntryHandle;

const HUD_DEPTH = 1000;

/** The real field: an `<input>` in Phaser's DOM container, over the input row. */
export const domChatEntry: ChatEntryFactory = (scene, rect, events) => {
  const el = document.createElement("input");
  el.type = "text";
  el.autocomplete = "off";
  el.spellcheck = false;
  el.setAttribute("aria-label", "Chat");
  Object.assign(el.style, {
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "0",
    margin: "0",
    color: toCss(palette.chatArea),
    caretColor: toCss(palette.chatArea),
    font: `13px ${CANVAS_FONT.body}`,
  });

  const size = (r: Rect) => {
    el.style.width = `${r.width - CHAT_INPUT_TEXT_X - 8}px`;
    el.style.height = `${r.height}px`;
  };
  size(rect);

  // every key stops here: none reaches Phaser's window listener, so typing W never walks and the
  // Enter that sends never reopens the input
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const composing = e.isComposing || e.keyCode === 229;
    if (!composing && (e.key === "Enter" || e.key === "Escape"))
      e.preventDefault();
    events.keyDown(e.key, composing);
  });
  el.addEventListener("keyup", (e) => e.stopPropagation());
  el.addEventListener("input", (e) =>
    events.typed((e as InputEvent).isComposing === true),
  );
  el.addEventListener("compositionend", () => events.typed(false));
  el.addEventListener("focus", () => events.focused());
  el.addEventListener("blur", () => events.blurred());

  const dom = scene.add
    .dom(rect.x + CHAT_INPUT_TEXT_X, rect.y, el)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(HUD_DEPTH);

  return {
    get value() {
      return el.value;
    },
    set value(v: string) {
      el.value = v;
    },
    focus: () => el.focus(),
    blur: () => el.blur(),
    moveTo: (r) => {
      dom.setPosition(r.x + CHAT_INPUT_TEXT_X, r.y);
      size(r);
    },
    destroy: () => dom.destroy(),
  };
};
