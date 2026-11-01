/**
 * The ready-check popup (FS-BJNYC R23–R26): when the leader chooses Enter as a party, every member,
 * the leader included, sees the same carved popup at the top centre: "<leader> would enter the
 * Spire. Are you ready?", one row per member with a tick box and their state, and a countdown in
 * whole seconds from the server's `expires_in_ms`. The leader's row is ticked from the moment it
 * opens. A member still waiting has **Decline** and **Accept**; once they press one, the answer
 * stands in the buttons' place. The leader's popup is status only.
 *
 * The check lives in the party store, which the socket feeds; the popup only draws it. It closes
 * when the store lets the check go: on `started` (the scene follows `world_entered`) or on
 * `cancelled` (the store says why in the chat window, as a party notice is said). The check only
 * happens in the town (R4, R10: leaving it cancels), so only the hub mounts the popup. Like the
 * invite prompt, it does not close a dialogue or a shop; an overlay that owns the screen hides it,
 * and the countdown runs on underneath.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import { useAuthStore } from "@/stores/authStore";
import {
  usePartyStore,
  type OpenReadyCheck,
  type PartyState,
  type ReadyCheckState,
} from "@/stores/partyStore";
import { socketManager } from "@/utils/class/SocketManager";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { partyCommands, type PartyCommands } from "./partyCommands";
import type { Rect } from "./partyPanelLayout";
import {
  READY_LABEL,
  READY_STATE_LABEL,
  readyCheckFrame,
  readyCheckView,
  readyCountdownText,
} from "./partyReadyCheckLayout";

export interface PartyReadyCheckDeps {
  store: StoreApi<PartyState>;
  commands: Pick<PartyCommands, "ready">;
  /** This player's id, as the server keys party members: whose row is theirs, and whether they lead. */
  selfId: () => string | undefined;
  /** Whether an overlay owns the screen now: the popup hides under it. */
  hidden: () => boolean;
}

/** The popup as the hub hangs it: the app's party store, the real socket, the signed-in player. */
export function mountPartyReadyCheck(
  scene: Phaser.Scene,
  hidden: () => boolean,
): PartyReadyCheck {
  return new PartyReadyCheck(scene, {
    store: usePartyStore,
    commands: partyCommands(socketManager),
    selfId: () => useAuthStore.getState().memberInfo?.id,
    hidden,
  });
}

/** The HUD's depth, as the invite prompt: under the gear overlay (1100). */
const POPUP_DEPTH = 1000;
const FONT_PX = 14;
const SMALL_PX = 12;
/** The tick box on each row. */
const BOX = 10;

/** Each state's colour: arcane for ready, the neutral label for waiting, oxblood for a no. */
const STATE_COLOUR: Readonly<Record<ReadyCheckState, number>> = {
  accepted: palette.safe,
  waiting: palette.hudLabel,
  declined: palette.unsafeFind,
};

const style = (colour: number, px = FONT_PX) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${px}px`,
  color: toCss(colour),
});

export class PartyReadyCheck {
  private graphics?: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  /** What the last draw showed: hidden or not, and the check's id and seconds. */
  private drawn = "";
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PartyReadyCheckDeps,
  ) {
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (
        state.readyCheck !== prev.readyCheck ||
        state.panelOpen !== prev.panelOpen
      )
        this.draw(true);
    });
    scene.events.on("postupdate", this.tick, this);
    this.draw(true);
  }

  /** Whether the popup is on screen now. */
  shown(): boolean {
    return this.graphics !== undefined;
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.events?.off("postupdate", this.tick, this);
    this.clear();
  }

  /** Once a frame: redraws when a second ticks or an overlay comes or goes. */
  private tick(): void {
    this.draw(false);
  }

  private answer(check: OpenReadyCheck, accept: boolean): void {
    this.deps.commands.ready(check.check_id, accept);
    this.deps.store.getState().answerReadyCheck(check.check_id, accept);
  }

  private clear(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  private text(
    x: number,
    y: number,
    content: string,
    colour: number,
    px = FONT_PX,
    wrap?: number,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, content, {
        ...style(colour, px),
        ...(wrap ? { wordWrap: { width: wrap } } : {}),
      })
      .setScrollFactor(0)
      .setDepth(POPUP_DEPTH);
    this.texts.push(t);
    return t;
  }

  /** A brass-outlined button, its words in the colour of what it does, as the invite prompt's. */
  private button(
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    label: string,
    colour: number,
    press: () => void,
  ): void {
    g.lineStyle(1, palette.frame, 0.8);
    g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, 3);
    this.text(r.x + r.width / 2, r.y + r.height / 2, label, colour, SMALL_PX)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", press);
  }

  /** A row's tick box: a tick for ready, a cross for a no, empty while waiting. */
  private box(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    state: ReadyCheckState,
  ): void {
    g.lineStyle(1, palette.frame, 0.6);
    g.strokeRect(x + 0.5, y + 0.5, BOX, BOX);
    g.lineStyle(2, STATE_COLOUR[state], 1);
    if (state === "accepted") {
      g.lineBetween(x + 2, y + 5, x + 4.5, y + 8);
      g.lineBetween(x + 4.5, y + 8, x + 9, y + 2);
    } else if (state === "declined") {
      g.lineBetween(x + 2.5, y + 2.5, x + 8.5, y + 8.5);
      g.lineBetween(x + 8.5, y + 2.5, x + 2.5, y + 8.5);
    }
  }

  /**
   * Draws the held check. `force` redraws whatever changed; otherwise only when what the player
   * would see differs from the last draw (a second ticked, an overlay came or went).
   */
  private draw(force: boolean): void {
    const {
      readyCheck: check,
      panelOpen,
      readySecondsLeft,
    } = this.deps.store.getState();
    const visible = check !== null && !this.deps.hidden();
    const seconds = visible ? readySecondsLeft(check) : 0;
    const key = visible ? `${check.check_id}:${seconds}` : "";
    if (!force && key === this.drawn) return;
    this.drawn = key;

    this.clear();
    if (!visible) return;

    const view = readyCheckView(check, this.deps.selfId());
    const f = readyCheckFrame(view.rows.length, {
      canvasWidth: this.scene.cameras.main.width,
      panelOpen,
    });
    const g = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(POPUP_DEPTH);
    this.graphics = g;
    carvedPanel(g, f.panel.x, f.panel.y, f.panel.width, f.panel.height);
    this.text(
      f.question.x,
      f.question.y,
      view.question,
      palette.hudText,
      FONT_PX,
      f.question.width,
    );
    view.rows.forEach((row, i) => {
      const r = f.rows[i];
      this.box(g, r.x, r.y + (r.height - BOX) / 2 - 1, row.state);
      this.text(r.x + BOX + 8, r.y, row.name, palette.hudText, SMALL_PX);
      this.text(
        r.x + r.width,
        r.y,
        READY_STATE_LABEL[row.state],
        STATE_COLOUR[row.state],
        SMALL_PX,
      ).setOrigin(1, 0);
    });
    this.text(
      f.countdown.x,
      f.countdown.y + 3,
      readyCountdownText(seconds),
      palette.hudLabel,
      SMALL_PX,
    );
    if (view.buttons) {
      // arcane for the way out, amber for the thing to do (design guideline, Gameplay accent)
      this.button(g, f.decline, READY_LABEL.decline, palette.safe, () =>
        this.answer(check, false),
      );
      this.button(g, f.accept, READY_LABEL.accept, palette.interactable, () =>
        this.answer(check, true),
      );
    } else if (view.status) {
      this.text(
        f.status.x + f.status.width,
        f.status.y + 3,
        view.status,
        palette.hudLabel,
        SMALL_PX,
      ).setOrigin(1, 0);
    }
  }
}
