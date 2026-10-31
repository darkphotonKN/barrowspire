/**
 * The party panel (FS-R82NV R28–R30): T opens and closes it in the hub, fields and runs. It lists
 * the party from the party store (name, class, where, the leader marked, away members greyed)
 * and holds its actions: Invite (a DOM field, live only in the hub), Kick and Transfer on each
 * other member for the leader, Leave for any member, and a reserved slot for the loot rule
 * (FS-V780R). Actions the server would refuse are greyed by role and by lock (`partyActions`).
 *
 * A carved panel on the game palette at the HUD's depth. The open state lives in the store, so
 * walking into a field with the panel open finds it open there; the scene only mounts it.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import type { WorldType } from "@/assets/types/client";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import {
  partyActions,
  usePartyStore,
  type PartyActions,
  type PartyState,
} from "@/stores/partyStore";
import { socketManager } from "@/utils/class/SocketManager";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { partyCommands, type PartyCommands } from "./partyCommands";
import {
  domPartyInviteField,
  type PartyInviteFieldFactory,
  type PartyInviteFieldHandle,
} from "./partyInviteField";
import {
  PARTY_HINT,
  PARTY_LABEL,
  mayTogglePartyPanel,
  partyClassLabel,
  partyPanelFrame,
  partyPanelTitle,
  partyWhereLabel,
  type FocusedElement,
  type PartyPanelFrame,
  type Rect,
} from "./partyPanelLayout";

export interface PartyPanelDeps {
  store: StoreApi<PartyState>;
  /** The world this player stands in now: the hub, a field, or a run. */
  world: () => WorldType | null;
  selfId: () => string | undefined;
  /** The panel's own actions: answering an invite is the invite prompt's. */
  commands: Pick<PartyCommands, "invite" | "kick" | "transfer" | "leave">;
  makeField: PartyInviteFieldFactory;
  /** The element holding keyboard focus: T is a letter while it takes typing (R28). */
  activeElement: () => FocusedElement | null;
  /** Whether a dialogue, a menu or an overlay owns the keys now. */
  blocked: () => boolean;
}

/** The panel as a scene hangs it: the app's party, the real socket and DOM field. */
export function mountPartyPanel(
  scene: Phaser.Scene,
  blocked: () => boolean,
): PartyPanel {
  return new PartyPanel(scene, {
    store: usePartyStore,
    world: () => useGameStore.getState().worldType,
    selfId: () => useAuthStore.getState().memberInfo?.id,
    commands: partyCommands(socketManager),
    makeField: domPartyInviteField,
    activeElement: () =>
      typeof document === "undefined"
        ? null
        : (document.activeElement as FocusedElement | null),
    blocked,
  });
}

const HUD_DEPTH = 1000;
const FONT_PX = 14;
const SMALL_PX = 12;
const TITLE_PX = 15;
/** An away or offline member's row, and a greyed action. */
const GREYED_ALPHA = 0.45;

const style = (colour: number, px = FONT_PX) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${px}px`,
  color: toCss(colour),
});

const within = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/**
 * A small brass crown before the leader's name: three points on a band. The party frames mark
 * their leader with it too (R34).
 */
export function drawLeaderMark(
  g: Pick<
    Phaser.GameObjects.Graphics,
    "fillStyle" | "fillRect" | "fillTriangle"
  >,
  x: number,
  y: number,
): void {
  g.fillStyle(palette.frameBright, 1);
  g.fillRect(x, y + 6, 10, 3);
  g.fillTriangle(x, y + 6, x + 2, y, x + 4, y + 6);
  g.fillTriangle(x + 3, y + 6, x + 5, y - 1, x + 7, y + 6);
  g.fillTriangle(x + 6, y + 6, x + 8, y, x + 10, y + 6);
}

export class PartyPanel {
  private graphics?: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private field?: PartyInviteFieldHandle;
  private frame?: PartyPanelFrame;
  private actions?: PartyActions;
  private drawnWorld: WorldType | null;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PartyPanelDeps,
  ) {
    this.drawnWorld = deps.world();
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (state.party !== prev.party || state.panelOpen !== prev.panelOpen)
        this.draw();
    });
    scene.input.keyboard?.on("keydown-T", this.onT, this);
    scene.input.on("pointerdown", this.onPress, this);
    scene.events.on("postupdate", this.watch, this);
    this.draw();
  }

  isOpen(): boolean {
    return this.deps.store.getState().panelOpen;
  }

  /** Whether a screen point lies on the open panel: a click there is the panel's, not the world's. */
  covers(x: number, y: number): boolean {
    return this.isOpen() && !!this.frame && within(this.frame.panel, x, y);
  }

  /** Which drawn row holds the leader, or -1: for tests of the leader mark. */
  leaderRow(): number {
    return this.actions?.members.findIndex((m) => m.leader) ?? -1;
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input?.keyboard?.off("keydown-T", this.onT, this);
    this.scene.input?.off("pointerdown", this.onPress, this);
    this.scene.events?.off("postupdate", this.watch, this);
    this.clear();
    this.field?.destroy();
    this.field = undefined;
  }

  private onT(): void {
    if (
      !mayTogglePartyPanel({
        blocked: this.deps.blocked(),
        active: this.deps.activeElement(),
      })
    )
      return;
    this.deps.store.getState().togglePanel();
  }

  /** A press in the world while the invite field has focus lets go of it, as the chat field does. */
  private onPress(pointer: { x: number; y: number }): void {
    if (!this.covers(pointer.x, pointer.y)) this.field?.blur();
  }

  /**
   * Once a frame: the DOM field shows only while the panel is open and nothing else owns the keys
   * (a browser element draws above every overlay), and a world switch under a live panel redraws
   * its greying.
   */
  private watch(): void {
    const world = this.deps.world();
    if (world !== this.drawnWorld) {
      this.drawnWorld = world;
      this.draw();
    }
    if (!this.field) return;
    if (this.isOpen() && !this.deps.blocked()) this.field.show();
    else this.field.hide();
  }

  private submit(value: string): void {
    if (!this.actions?.invite) return;
    if (this.deps.commands.invite(value) && this.field) this.field.value = "";
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
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, content, style(colour, px))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.texts.push(t);
    return t;
  }

  /** A brass-outlined button: amber words when the viewer may press it, faint and inert when not. */
  private button(
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    label: string,
    enabled: boolean,
    press: () => void,
  ): void {
    g.lineStyle(1, palette.frame, enabled ? 0.8 : 0.3);
    g.strokeRoundedRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1, 3);
    const t = this.text(
      r.x + r.width / 2,
      r.y + r.height / 2,
      label,
      enabled ? palette.interactable : palette.hudFaint,
      SMALL_PX,
    ).setOrigin(0.5, 0.5);
    if (!enabled) {
      t.setAlpha(GREYED_ALPHA);
      return;
    }
    t.setInteractive({ useHandCursor: true }).on("pointerdown", press);
  }

  private draw(): void {
    this.clear();
    const { party, panelOpen } = this.deps.store.getState();
    const actions = partyActions(party, this.deps.selfId(), this.deps.world());
    const frame = partyPanelFrame(actions);
    this.actions = actions;
    this.frame = frame;
    this.field ??= this.deps.makeField(this.scene, frame.inviteField, {
      submit: (value) => this.submit(value),
    });
    this.field.moveTo(frame.inviteField);
    this.field.setEnabled(actions.invite);
    if (!panelOpen) {
      this.field.hide();
      return;
    }

    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.graphics = g;
    const { panel, title } = frame;
    carvedPanel(g, panel.x, panel.y, panel.width, panel.height);
    this.text(
      title.x,
      title.y,
      partyPanelTitle(party),
      palette.frameBright,
      TITLE_PX,
    );

    actions.members.forEach((m, i) => {
      const { row, transfer, kick } = frame.rows[i];
      const nameX = row.x + 16;
      if (m.leader) drawLeaderMark(g, row.x, row.y + 5);
      const alpha = m.away ? GREYED_ALPHA : 1;
      this.text(nameX, row.y + 1, m.name, palette.hudText).setAlpha(alpha);
      this.text(
        nameX,
        row.y + 19,
        `${partyClassLabel(m.class)} · ${partyWhereLabel(m.where)}`,
        palette.hudLabel,
        SMALL_PX,
      ).setAlpha(alpha);
      // Kick and Transfer sit on each other member's row, greyed for anyone but the leader
      if (m.self) return;
      this.button(g, transfer, PARTY_LABEL.transfer, m.transfer, () =>
        this.deps.commands.transfer(m.player_id),
      );
      this.button(g, kick, PARTY_LABEL.kick, m.kick, () =>
        this.deps.commands.kick(m.player_id),
      );
    });

    // frame.loot is the loot-rule selector's reserved slot (FS-V780R): left blank until it lands

    if (frame.hint)
      this.text(frame.hint.x, frame.hint.y + 2, PARTY_HINT, palette.hudLabel);

    const invite = frame.invite;
    this.text(
      invite.x,
      invite.y + 4,
      PARTY_LABEL.invite,
      palette.hudLabel,
    ).setAlpha(actions.invite ? 1 : GREYED_ALPHA);
    const f = frame.inviteField;
    g.lineStyle(1, palette.frame, actions.invite ? 0.6 : 0.2);
    g.lineBetween(f.x, f.y + f.height - 1, f.x + f.width, f.y + f.height - 1);

    if (frame.leave)
      this.button(g, frame.leave, PARTY_LABEL.leave, actions.leave, () =>
        this.deps.commands.leave(),
      );
  }
}
