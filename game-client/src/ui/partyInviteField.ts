/**
 * The party panel's invite field, the DOM half (FS-R82NV R29): a browser `<input>` like the chat
 * field's, so an input method (Chinese, Japanese, Korean) can type a name. It reports Enter and
 * Esc to the panel and holds no rule of its own; checked by eye rather than in a DOM test.
 * Canvas chrome on the DOM: it wears the game palette, transparent over the panel Phaser draws.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { PARTY_INVITE_HINT, type Rect } from "./partyPanelLayout";

export interface PartyInviteFieldEvents {
  /** Enter outside a composition: the field's text, as typed. */
  submit(value: string): void;
}

export interface PartyInviteFieldHandle {
  value: string;
  /** Greyed and untypeable outside the hub, or when the viewer may not invite (R29). */
  setEnabled(enabled: boolean): void;
  moveTo(rect: Rect): void;
  show(): void;
  hide(): void;
  blur(): void;
  destroy(): void;
}

export type PartyInviteFieldFactory = (
  scene: Phaser.Scene,
  rect: Rect,
  events: PartyInviteFieldEvents,
) => PartyInviteFieldHandle;

const HUD_DEPTH = 1000;
const FIELD_H = "22px";
const DISABLED_OPACITY = "0.4";

export const domPartyInviteField: PartyInviteFieldFactory = (
  scene,
  rect,
  events,
) => {
  const field = document.createElement("input");
  field.type = "text";
  field.autocomplete = "off";
  field.spellcheck = false;
  field.maxLength = 64;
  field.setAttribute("aria-label", "Invite to party");
  field.placeholder = PARTY_INVITE_HINT;
  field.classList.add("party-invite-field");
  Object.assign(field.style, {
    background: "transparent",
    border: "none",
    outline: "none",
    boxShadow: "none",
    padding: "0 4px",
    margin: "0",
    font: `14px ${CANVAS_FONT.body}`,
    height: FIELD_H,
    lineHeight: FIELD_H,
    color: toCss(palette.hudText),
    caretColor: toCss(palette.hudText),
    boxSizing: "border-box",
  });
  const placeholderStyle = document.createElement("style");
  placeholderStyle.textContent = `.party-invite-field::placeholder { color: ${toCss(palette.hudLabel)}; opacity: 0.7; }`;
  const shell = document.createElement("div");
  shell.append(placeholderStyle, field);

  const size = (r: Rect) => {
    field.style.width = `${r.width}px`;
  };
  size(rect);

  // every key stops here, as in the chat field: typing T never toggles the panel, W never walks,
  // and the Enter that sends never opens the chat input behind
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    const composing = e.isComposing || e.keyCode === 229;
    if (composing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      events.submit(field.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      field.blur();
    }
  });
  field.addEventListener("keyup", (e) => e.stopPropagation());

  const centre = (r: Rect) => r.y + (r.height - parseInt(FIELD_H, 10)) / 2;
  const dom = scene.add
    .dom(rect.x, centre(rect), shell)
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
    setEnabled: (enabled) => {
      field.disabled = !enabled;
      field.style.opacity = enabled ? "1" : DISABLED_OPACITY;
      field.style.cursor = enabled ? "text" : "not-allowed";
      if (!enabled) field.blur();
    },
    moveTo: (r) => {
      dom.setPosition(r.x, centre(r));
      size(r);
    },
    // as the chat field: Phaser applies visibility on its next render, so the node is set too
    show: () => {
      dom.setVisible(true);
      shell.style.display = "block";
    },
    hide: () => {
      field.blur();
      dom.setVisible(false);
      shell.style.display = "none";
    },
    blur: () => field.blur(),
    destroy: () => dom.destroy(),
  };
};
