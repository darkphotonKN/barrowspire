/**
 * The chat input row's DOM half (FS-WJGFJ R26; Amendment 2026-10-31): a channel picker (`<select>`)
 * and a text field (`<input>`) side by side over the window's input row, as one Phaser DOM element.
 * A browser field is the only way an input method (Chinese, Japanese, Korean) reaches the game;
 * a native picker brings keyboard access for free. Kept as thin as it can be: it reports focus,
 * keys, typing and picks to `ChatInput`, which holds every rule, and is checked by eye rather
 * than in a DOM test.
 *
 * Canvas chrome on the DOM, by decision: it wears the game palette like the rest of the chat
 * window, transparent over the near-black input row Phaser draws beneath it (I-WJGFJ-4, -6).
 */

import type Phaser from "phaser";
import { CHAT_CHANNELS, type ChatChannel } from "@/stores/chatStore";
import { CANVAS_FONT, palette, rgba, toCss } from "@/utils/canvasPalette";
import { CHAT_OPEN_CHANNELS, type ChatEntryField } from "./chatInput";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_FILTER_LABEL,
  CHAT_PICKER_W,
  type Rect,
} from "./chatWindowLayout";

/** What the row tells the chat input. */
export interface ChatEntryEvents {
  focused(): void;
  blurred(): void;
  keyDown(key: string, composing: boolean): void;
  typed(composing: boolean): void;
  /** The picker chose a channel. */
  picked(channel: ChatChannel): void;
}

/** A row the window can place and take down, as well as the input drives it. */
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
/** The picker's arrow sits this far in from its divider, and the label stops short of the arrow. */
const PICKER_ARROW_GAP = 8;
const PICKER_ARROW_ROOM = 22;
const FONT = () => `13px ${CANVAS_FONT.body}`;

/** The real row: a picker and a field in Phaser's DOM container, over the input row, short of the fold button. */
export const domChatEntry: ChatEntryFactory = (scene, rect, events) => {
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

  // the picker draws its own arrow: a native one hugs the divider and no padding moves it in every
  // browser, so the select loses its native look and a ▾ sits a fixed gap off the divider
  const pickerBox = document.createElement("div");
  Object.assign(pickerBox.style, {
    position: "relative",
    width: `${CHAT_PICKER_W}px`,
    height: "100%",
    display: "flex",
    alignItems: "center",
    // as faint as the window's other rules (asked 2026-10-31: the full brass was too bright)
    borderRight: `1px solid ${rgba(palette.chatRule, 0.35)}`,
    boxSizing: "border-box",
  });
  const picker = document.createElement("select");
  picker.setAttribute("aria-label", "Chat channel");
  Object.assign(picker.style, {
    width: "100%",
    appearance: "none",
    background: "transparent",
    border: "none",
    outline: "none",
    // the site's :focus-visible draws a ring as a box-shadow; the window shows focus by itself
    boxShadow: "none",
    padding: `0 ${PICKER_ARROW_ROOM}px 0 4px`,
    font: FONT(),
    cursor: "pointer",
  });
  const arrow = document.createElement("span");
  arrow.textContent = "▾";
  arrow.setAttribute("aria-hidden", "true");
  Object.assign(arrow.style, {
    position: "absolute",
    right: `${PICKER_ARROW_GAP}px`,
    top: "50%",
    transform: "translateY(-50%)",
    // clicks fall through to the select beneath, so the arrow opens it too
    pointerEvents: "none",
    font: FONT(),
  });
  pickerBox.append(picker, arrow);
  for (const channel of CHAT_CHANNELS) {
    const option = document.createElement("option");
    option.value = channel;
    option.textContent = CHAT_FILTER_LABEL[channel];
    // a channel the server does not relay yet is listed, and cannot be picked
    option.disabled = !CHAT_OPEN_CHANNELS.has(channel);
    Object.assign(option.style, {
      background: toCss(palette.chatInputGround),
      color: toCss(CHAT_CHANNEL_COLOUR[channel]),
    });
    picker.appendChild(option);
  }
  const showChannel = (channel: ChatChannel) => {
    picker.value = channel;
    picker.style.color = toCss(CHAT_CHANNEL_COLOUR[channel]);
    arrow.style.color = toCss(CHAT_CHANNEL_COLOUR[channel]);
    field.style.color = toCss(CHAT_CHANNEL_COLOUR[channel]);
    field.style.caretColor = toCss(CHAT_CHANNEL_COLOUR[channel]);
  };

  const field = document.createElement("input");
  field.type = "text";
  field.autocomplete = "off";
  field.spellcheck = false;
  field.setAttribute("aria-label", "Chat");
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
  });

  row.append(pickerBox, field);
  showChannel("area");

  const size = (r: Rect) => {
    shell.style.width = `${r.width - 8}px`;
    shell.style.height = `${r.height}px`;
  };
  size(rect);

  // every key stops here: none reaches Phaser's window listener, so typing W never walks and the
  // Enter that sends never reopens the input
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const composing = e.isComposing || e.keyCode === 229;
    // Enter and Esc are the input's; the arrows walk the sent lines, so the caret must not jump
    if (
      !composing &&
      ["Enter", "Escape", "ArrowUp", "ArrowDown"].includes(e.key)
    )
      e.preventDefault();
    events.keyDown(e.key, composing);
  });
  field.addEventListener("keyup", (e) => e.stopPropagation());
  field.addEventListener("input", (e) =>
    events.typed((e as InputEvent).isComposing === true),
  );
  field.addEventListener("compositionend", () => events.typed(false));
  field.addEventListener("focus", () => events.focused());
  field.addEventListener("blur", () => events.blurred());
  picker.addEventListener("keydown", (e) => e.stopPropagation());
  picker.addEventListener("keyup", (e) => e.stopPropagation());
  picker.addEventListener("change", () => {
    events.picked(picker.value as ChatChannel);
    // straight back to typing, on the channel just picked
    field.focus();
  });

  const dom = scene.add
    .dom(rect.x + 4, rect.y, shell)
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
      return picker.value as ChatChannel;
    },
    set channel(c: ChatChannel) {
      showChannel(c);
    },
    focus: () => field.focus(),
    blur: () => field.blur(),
    moveTo: (r) => {
      dom.setPosition(r.x + 4, r.y);
      size(r);
    },
    destroy: () => dom.destroy(),
  };
};
