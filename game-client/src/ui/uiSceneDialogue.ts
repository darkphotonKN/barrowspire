/**
 * The UI scene's dialogue slot (FS-TQZ5J Amendment A2 R29–R32): the town's NPC dialogue card, drawn
 * from the plain data the town shows through the UI bridge (`ShownDialogue`) with today's card
 * (`showDialogueCard`) at the popup band, over the corner row as it stood when both were the town's.
 * A row picked, by the pointer or by its key, goes back to the town as its id (`pickDialogue`, R30);
 * what a pick does stays the town's (its choices, its pendings, its pages).
 *
 * The town sends the card again whenever any part of it changes. The same speaker, text and option ids
 * retone the card standing, as today's `retone`, so a row the pointer is on keeps its hover; any other
 * replaces it, as today's close-then-show of a turned page (R29). It goes, sending nothing, as its world
 * leaves or another reports (R32).
 *
 * Its keys are the UI scene's while it is shown (R31), handed in once a frame as the menu's are
 * (`handKeys`): E and Enter pick the first actionable row (with none, they close it), 1–3 an actionable
 * row by number. Esc's step is the menu slot's, which dismisses an open dialogue first (R17).
 *
 * Phaser-free: the UI scene hands it the drawing, so the wiring is tested on its own.
 */

import type { DialogueCardSpec } from "./npcDialogue";
import type { DialogueOption, ShownDialogue, UiBridge, WorldReport } from "./uiBridge";
import { MENU_LOOKS, type MenuKeysPressed, type UiMenuSlot } from "./uiSceneMenu";

/** A card standing in the slot, as `showDialogueCard` returns it. */
export interface DrawnCard {
  container: { destroy(): void };
  retone(): void;
  relayout(): void;
}

/** What of the bridge the slot reads and asks through. */
export type DialogueBridge = Pick<UiBridge, "world" | "request">;

/** The card's keys this frame: E or Enter, and 1–3 as 0–2 (-1 for none). */
export interface CardKeysPressed {
  confirm: boolean;
  numbered: number;
}

/** The keys the UI scene read this frame, for the slot that holds them: the menu's, and E. */
export interface UiKeysPressed extends MenuKeysPressed {
  e: boolean;
}

/** The card standing: what it shows now, the world that showed it, and its drawing. */
interface Standing {
  shown: ShownDialogue;
  report: WorldReport;
  card?: DrawnCard;
}

/** Whether `next` is the card standing again, changed only in what can be picked (R29). */
function sameCard(was: ShownDialogue, next: ShownDialogue): boolean {
  const ids = (shown: ShownDialogue) => shown.options.map((o) => o.id).join("\n");
  return (
    was.text === next.text &&
    was.speaker.name === next.speaker.name &&
    was.speaker.role === next.speaker.role &&
    was.speaker.portrait?.texture === next.speaker.portrait?.texture &&
    was.speaker.portrait?.frame === next.speaker.portrait?.frame &&
    ids(was) === ids(next)
  );
}

export class UiDialogueSlot {
  private standing: Standing | null = null;

  constructor(
    private readonly bridge: DialogueBridge,
    private readonly draw: (spec: DialogueCardSpec) => DrawnCard,
  ) {}

  isOpen(): boolean {
    return this.standing !== null;
  }

  /**
   * The world's dialogue, or none (R29): drawn, retoned in place, replaced, or taken down. Nothing is
   * drawn while no world is reported: there is no world to answer it.
   */
  show(shown: ShownDialogue | null): void {
    const standing = this.standing;
    if (shown && standing && standing.report === this.bridge.world && sameCard(standing.shown, shown)) {
      standing.shown = shown;
      standing.card?.retone();
      return;
    }
    this.close();
    const report = this.bridge.world;
    if (!shown || !report) return;
    // standing before it is drawn: its rows read whether they can be picked from it as they are made
    const drawing: Standing = { shown, report };
    this.standing = drawing;
    drawing.card = this.draw(this.spec(drawing));
  }

  /**
   * The keys pressed this frame, while a card is shown (R31): E or Enter its first actionable row,
   * or with none a close as Esc's; a number that actionable row. A dimmed row answers nothing.
   */
  keys(pressed: CardKeysPressed): void {
    const shown = this.standing?.shown;
    if (!shown) return;
    const actionable = shown.options.filter((o) => o.register === "actionable");
    if (pressed.confirm) {
      if (actionable.length === 0) this.bridge.request({ kind: "close", window: "dialogue" });
      else this.pick(actionable[0].id);
    } else if (pressed.numbered >= 0) {
      const option = actionable[pressed.numbered];
      if (option) this.pick(option.id);
    }
  }

  /** The world's report heard again, or none as it leaves (R32): the card goes with the world that showed it. */
  sync(): void {
    if (this.standing && this.standing.report !== this.bridge.world) this.close();
  }

  /** The logical view changed: the card, its hit areas and its mask, back to the corner (FS-ZAJMH R13). */
  relayout(): void {
    this.standing?.card?.relayout();
  }

  /** Takes the card down, sending nothing: the world's close, its leaving, the UI scene's end. */
  close(): void {
    const standing = this.standing;
    if (!standing) return;
    this.standing = null;
    standing.card?.container.destroy();
  }

  /** An option picked, by the pointer or its key: its id handed to the world, while it can be picked (R30). */
  private pick(id: string): void {
    if (!this.option(id)?.enabled) return;
    this.bridge.request({ kind: "pickDialogue", id });
  }

  /** The option of the card standing now, by id: its `enabled` is the town's latest word. */
  private option(id: string): DialogueOption | undefined {
    return this.standing?.shown.options.find((o) => o.id === id);
  }

  /**
   * Today's card from the world's data (HubScene.showDialogue at 74ecdf3c): each row its key said on
   * its label (with one thing to do it is E, the key that opened the dialogue; with several each has
   * its number, so none is mouse-only; Esc always declines), amber to do, the cancel register to go
   * back, in the world's tones; whether it can be picked read from this card's latest data, so a
   * retone reads the town's latest word.
   */
  private spec(standing: Standing): DialogueCardSpec {
    const { shown, report } = standing;
    const tones = MENU_LOOKS[report.world].tones;
    const actionable = shown.options.filter((o) => o.register === "actionable");
    const hint = (option: DialogueOption) => {
      if (option.register === "cancel") return "  [Esc]";
      if (actionable.length === 1) return "  [E]";
      return `  [${actionable.indexOf(option) + 1}]`;
    };
    return {
      name: shown.speaker.name,
      role: shown.speaker.role,
      line: shown.text,
      rows: shown.options.map((option) => ({
        id: option.id,
        label: `${option.label}${hint(option)}`,
        colour: option.register === "actionable" ? tones.actionable : tones.cancel,
        onPick: () => this.pick(option.id),
        enabled: () => standing.shown.options.find((o) => o.id === option.id)?.enabled ?? false,
      })),
      portrait: shown.speaker.portrait ? { ...shown.speaker.portrait } : undefined,
      tones,
    };
  }
}

/**
 * The keys the UI scene read this frame (R17, R18, A2 R31), handed to whichever slot holds them: a shown
 * card's E, Enter and 1–3; Esc's step and, with no card, the menu's keys, the menu slot's. The two are
 * never filled at once (the menu yields to a dialogue and does not open over one, R20).
 */
export function handKeys(pressed: UiKeysPressed, card: UiDialogueSlot | undefined, menu: UiMenuSlot | undefined): void {
  if (!pressed.esc && card?.isOpen()) {
    card.keys({ confirm: pressed.e || pressed.enter, numbered: pressed.numbered });
    return;
  }
  menu?.keys(pressed);
}
