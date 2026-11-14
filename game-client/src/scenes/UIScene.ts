import * as Phaser from "phaser";
import { UI_SCENE } from "@/components/uiSceneLifecycle";
import { browserMusicStore, storedMusicLevel } from "@/audio/musicSetting";
import { browserSfxStore } from "@/audio/sfxSetting";
import { letGoOfGameField } from "@/components/gameFocus";
import { sceneUiSoundStage } from "@/audio/uiSounds";
import { relayoutOn, viewport } from "@/render/viewport";
import { lentFullscreen } from "@/ui/gameFullscreen";
import { HudCorner } from "@/ui/HudCorner";
import { showMenuPanel } from "@/ui/menuPanel";
import { showDialogueCard } from "@/ui/npcDialogue";
import { openOptionsPanel } from "@/ui/optionsPanel";
import { mountPartyPanel } from "@/ui/PartyPanel";
import { rectsMeet, type Rect } from "@/ui/partyPanelLayout";
import { mountPartyInvitePrompt } from "@/ui/PartyInvitePrompt";
import { mountPartyReadyCheck } from "@/ui/PartyReadyCheck";
import { mountPartyFrames } from "@/ui/PartyFrames";
import { registerArt } from "@/render/art/phaser";
import { RESIDENT_ART } from "@/render/art/sceneArt";
import type { ArtLibrary, FrameQuery } from "@/render/art/library";
import { uiBridgeOf, type UiBridge, type World } from "@/ui/uiBridge";
import { UiCornerRow } from "@/ui/uiSceneCorner";
import { UiDialogueSlot, handKeys } from "@/ui/uiSceneDialogue";
import { UiMenuSlot } from "@/ui/uiSceneMenu";
import { UiNoticeLayer, drawNotice } from "@/ui/uiSceneNotices";
import { UiPartySlot, partyPanelWiring, partyPromptWiring, type PartyPieces } from "@/ui/uiSceneParty";
import { UiScenePointer } from "@/ui/uiScenePointer";
import { UiGearSlot, type GearKey } from "@/ui/uiSceneGear";
import { mountGearPieces } from "@/ui/gearPieces";
import { UiControlsSlot, UiRecordSlot, type OpenWindows } from "@/ui/uiSceneRecord";
import { SettlementRecord } from "@/ui/SettlementRecord";
import { mountControlsPiece } from "@/ui/controlsPiece";
import { ControlsBadge } from "@/ui/ControlsBadge";
import { UiControlsBadge } from "@/ui/uiSceneControlsBadge";
import { recordAnchor } from "@/ui/resolvedRow";
import { mountInterfaceSounds } from "@/ui/uiSceneSounds";
import { onSceneEnd } from "./sceneEnd";

/**
 * The UI scene's keys (R17, R18, A2 R31): Esc, its own outright; Enter, 1–3 and ←/→, the menu's while
 * it is open; E, Enter and 1–3, the town's dialogue card's while it is shown.
 */
interface MenuKeyObjects {
  esc: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
  numbers: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  /** The town's polled keys, standing only while the town is reported (§ Change: Phase 3, R56). */
  town?: TownKeyObjects;
}

/**
 * The town's E (its dialogue card's and its inventory's) and the gear's I, B and C, read once a frame
 * for the town, which polled them (§ Change: Phase 3, R56). Made as the town is reported and removed
 * as it leaves: Phaser 4.2.1 emits no `keydown-X` for a held key's auto-repeat while the scene holds a
 * Key for its code (KeyboardPlugin.update: `repeat = key.isDown`, the event only `if (!key || !repeat)`),
 * and a field's and the run's gear keys are heard on those events, repeat included.
 */
interface TownKeyObjects {
  e: Phaser.Input.Keyboard.Key;
  i: Phaser.Input.Keyboard.Key;
  b: Phaser.Input.Keyboard.Key;
  c: Phaser.Input.Keyboard.Key;
}

/** The keys a field and the run heard on key events, by the gear key each is (§ Change: Phase 3, R56). */
const EVENT_GEAR_KEYS: readonly (readonly [string, GearKey])[] = [
  ["keydown-I", "inventory"],
  ["keydown-B", "inventory"],
  ["keydown-C", "character"],
  ["keydown-Q", "close"],
  ["keydown-E", "equip"],
  ["keydown-F", "take"],
];

/**
 * The UI scene (FS-TQZ5J §A, ADR-0081): the one scene drawn over every world scene and under the
 * disconnect notice, holding the interface the worlds share. In the game's scene list after the
 * world scenes, so it is drawn over them and Phaser hands it a press first (R1, R7). Its life is the
 * worlds' reports through the UI bridge (`uiSceneLifecycle.ts`): launched on the first world entry,
 * never restarted by a switch, asleep outside the worlds, held under the notice (R2–R5). The game's
 * ViewportFit fits its camera and `fitGame` re-fits it, as every scene's (R6).
 *
 * The interface moves in piece by piece (FS-TQZ5J § Phases). It holds the game's interface sounds
 * (R22), the corner row, built for each world as it reports itself (R13), the one menu slot: the
 * ESC menu, OPTIONS and the run's Fall confirm, with Esc and the menu's keys (R16–R21), the town's
 * NPC dialogue card, drawn from the data the town shows, with its keys (A2 R29–R32), the worlds'
 * screen notices, on its own clock (A2 R33, R34), and the party pieces, built for each world (§ Change:
 * Phase 2: the party, R36). Its pointer stands beside
 * the worlds' as Amendment A1 says, for every piece it holds: a world's press stays the world's, a
 * press on a piece lets go of the game's text field, and every move reaches the world (R25–R27).
 *
 * A RESUME is not always a return to play. Return to menu under the disconnect notice resumes this
 * scene only to sleep it, Phaser's sleep taking a running scene only (`driveUiScene`'s hide), so it
 * hears RESUME then SLEEP back to back with no world up. A RESUME listener must not take it for the
 * world coming back: WAKE, with the next world's report, is that.
 */
export class UIScene extends Phaser.Scene {
  private corner?: UiCornerRow;
  private menu?: UiMenuSlot;
  private dialogue?: UiDialogueSlot;
  private party?: UiPartySlot;
  /** The gear overlay and the container view (FS-TQZ5J § Change: Phase 3, R50). */
  private gear?: UiGearSlot;
  /** The run's controls panel (FS-TQZ5J § Change: Phase 3, R50, R56). */
  private controls?: UiControlsSlot;
  /** The run's settlement record (FS-TQZ5J § Change: Phase 3, R57). */
  private record?: UiRecordSlot;
  /** The run's controls badge over its ability card (FS-84N1G R3–R8). */
  private badge?: UiControlsBadge;
  /** The resident art the party frames cut their busts from, registered as a bust is first cut. */
  private art?: ArtLibrary;
  private keys?: MenuKeyObjects;
  private pointer?: UiScenePointer<Phaser.Input.Pointer>;

  constructor() {
    super({ key: UI_SCENE });
  }

  /**
   * The game's one interface sound player, lent to its game's UI bridge (R22). The first world's
   * report launches this scene, and Phaser's start of a scene with no preload runs its create at
   * once (`SceneManager.start` → `bootScene` → `create`), so the player is lent inside that world's
   * create, before anything there hears a player. A sleep keeps it: the game's sound manager plays it.
   */
  create(): void {
    const bridge = uiBridgeOf(this.registry);
    if (!bridge) return;
    mountInterfaceSounds(bridge, sceneUiSoundStage(this), browserSfxStore, undefined, {
      party: () => this.party?.isOpen() ?? false,
      inventory: () => this.gear?.isInventoryOpen() ?? false,
      character: () => this.gear?.isCharacterOpen() ?? false,
    });
    this.mountInterface(bridge);
    this.mountKeys();
    this.mountPointer(bridge);
  }

  /**
   * Each frame while it runs, before the world's own update (Phaser steps the scene list from the
   * top): the menu's and the dialogue card's keys pressed since the last frame, read here (R21; T, the
   * party panel's own, is heard on its key event, § Change: Phase 2: the party, R43); the menu yielding
   * to the world's report (R20); and a world's press whose release it never heard let go of (A1 R25).
   */
  update(): void {
    this.readKeys();
    this.menu?.sync();
    // another window opened since the last frame closes the run's controls panel, before this frame
    // draws, outside any action, so only the opened window's sound plays (FS-84N1G R16)
    this.controls?.sync(this.openWindows());
    this.pointer?.frame();
  }

  /** Every window but the controls panel, open or not (FS-84N1G R16): the UI's own and the world's letter panel. */
  private openWindows(): OpenWindows {
    const bridge = this.bridge();
    const ui = bridge?.ui;
    return {
      menu: !!ui?.menuOpen,
      inventory: !!ui?.inventory,
      character: !!ui?.character,
      stash: !!ui?.stash,
      container: ui?.container !== undefined,
      party: this.party?.isOpen() ?? false,
      record: this.record?.isOpen() ?? false,
      letter: bridge?.world?.windows().letter ?? false,
    };
  }

  /**
   * The keys this frame (R17, R18, R21, A2 R31), each read every frame so a press never waits to answer
   * a later one: Esc's step; with a dialogue card shown E, Enter and 1–3 its; with the menu slot filled
   * Enter, 1–3 and ←/→ its. Read once a frame in update,
   * never on a key event: Phaser hands a key event to the scenes' keyboards in the order they
   * started, which a world switch turns round (§ Spike findings (b)), while it steps the scenes'
   * updates in the scene list's order, the same in every session.
   */
  private readKeys(): void {
    const keys = this.keys;
    if (!keys) return;
    const down = Phaser.Input.Keyboard.JustDown;
    const esc = down(keys.esc);
    const enter = down(keys.enter);
    const numbered = keys.numbers.map((key) => down(key)).indexOf(true);
    const left = down(keys.left);
    const right = down(keys.right);
    // the town's E, I, B and C, standing only while the town is reported (§ Change: Phase 3, R56)
    const town = keys.town;
    const e = town ? down(town.e) : false;
    const inventory = town ? [down(town.i), down(town.b)].includes(true) : false;
    const character = town ? down(town.c) : false;
    const carded = this.dialogue?.isOpen() ?? false;
    handKeys({ esc, e, enter, numbered, nudge: left === right ? undefined : left ? -1 : 1 }, this.dialogue, this.menu);
    if (!town || this.bridge()?.world?.world !== "hub") return;
    // the town polled its gear keys once a frame, and gave E to the open inventory after a shown card
    if (inventory) this.gear?.key("inventory");
    if (character) this.gear?.key("character");
    if (e && !carded) this.gear?.key("equip");
  }

  /** The game's UI bridge, as create found it. */
  private bridge(): UiBridge | null {
    return uiBridgeOf(this.registry);
  }

  /**
   * The menu's and the dialogue card's keys on this scene's keyboard (R21, A2 R31). Esc is captured
   * while the scene is awake, as the worlds that bound it captured it, and handed back as it sleeps
   * (main menu, character creation) and taken again as it wakes; the shared keys are not captured
   * here: the worlds that use them (the town's E and Enter among them) capture them as before. The
   * town's E, I, B and C stand only while the town is reported (`TownKeyObjects`). Phaser drops a
   * scene's keys as it is destroyed with the game.
   */
  private mountKeys(): void {
    const keyboard = this.input?.keyboard;
    if (!keyboard) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const keys: MenuKeyObjects = {
      esc: keyboard.addKey(codes.ESC),
      enter: keyboard.addKey(codes.ENTER, false),
      numbers: [codes.ONE, codes.TWO, codes.THREE].map((code) => keyboard.addKey(code, false)),
      left: keyboard.addKey(codes.LEFT, false),
      right: keyboard.addKey(codes.RIGHT, false),
    };
    this.keys = keys;
    this.events.on(Phaser.Scenes.Events.SLEEP, () => keyboard.removeCapture(codes.ESC));
    this.events.on(Phaser.Scenes.Events.WAKE, () => keyboard.addCapture(codes.ESC));
    // a field's and the run's gear keys, on key events as they heard them, uncaptured (R56)
    for (const [event, key] of EVENT_GEAR_KEYS)
      keyboard.on(event, () => {
        if (this.bridge()?.world?.world === "hub") return;
        // Q closes the run's open controls panel first, and nothing else (FS-84N1G R18)
        if (key === "close" && this.controls?.closeKey()) return;
        this.gear?.key(key);
      });
    // the run's H, on its key event as the run heard it (R56)
    keyboard.on("keydown-H", () => this.controls?.toggle());
    // the town's keys while it stands, I, B and C captured as its `addKey` did; removed and let go as
    // it leaves, so a field's and the run's held keys repeat again (R56)
    const captured = [codes.I, codes.B, codes.C];
    const standTown = (want: boolean) => {
      if (want === !!keys.town) return;
      if (want) {
        keys.town = {
          e: keyboard.addKey(codes.E, false),
          i: keyboard.addKey(codes.I, false),
          b: keyboard.addKey(codes.B, false),
          c: keyboard.addKey(codes.C, false),
        };
        keyboard.addCapture(captured);
        return;
      }
      for (const key of Object.values(keys.town ?? {})) keyboard.removeKey(key, true);
      keys.town = undefined;
      keyboard.removeCapture(captured);
    };
    const bridge = this.bridge();
    const stop = bridge?.onWorld((report) => standTown(report?.world === "hub"));
    standTown(bridge?.world?.world === "hub");
    onSceneEnd(this, () => stop?.());
  }

  /**
   * Its pointer beside the worlds' (A1 R25–R27), told its own scene-wide events as Phaser emits them
   * here, before any world hears the event: the world reported is handed a move Phaser stopped here,
   * and the game's text field is let go of inside the canvas's holder. Phaser drops a scene's input
   * listeners as it shuts down.
   */
  private mountPointer(bridge: UiBridge): void {
    const input = this.input;
    if (!input) return;
    /** Where the press being heard landed, logical units (FS-ZAJMH R15). */
    let pressedAt = { x: -1, y: -1 };
    const pointer = new UiScenePointer<Phaser.Input.Pointer>({
      cameras: () => this.cameras.cameras,
      anyDown: () => input.manager.pointers.some((p) => p.isDown),
      world: bridge,
      // a press on the party panel keeps its invite field (§ Change: Phase 2: the party, R42)
      letGo: () => {
        if (this.party?.keepsField(pressedAt.x, pressedAt.y)) return;
        letGoOfGameField(this.game.canvas?.parentElement, document);
      },
    });
    this.pointer = pointer;
    input.on("pointerdown", (p: Phaser.Input.Pointer, over: unknown[]) => {
      pressedAt = viewport.toLogical(p);
      pointer.pressed(over);
    });
    input.on("pointerup", () => pointer.released());
    input.on("pointerupoutside", () => pointer.released());
    input.on("pointermove", (p: Phaser.Input.Pointer, over: unknown[]) => pointer.moved(p, over));
    // the container view hit-tests by hand, on its own ground only (§ Change: Phase 3, R60)
    input.on("pointermove", (p: Phaser.Input.Pointer, over: unknown[]) => {
      const at = viewport.toLogical(p);
      this.gear?.pointerMove(at.x, at.y, over);
    });
    input.on("pointerdown", (p: Phaser.Input.Pointer, over: unknown[]) => {
      const at = viewport.toLogical(p);
      this.gear?.pointerDown(at.x, at.y, p.button === 0, over);
    });
    input.on("pointerout", (p: Phaser.Input.Pointer) => pointer.left(p));
  }

  /**
   * The corner row (R13), the menu slot (R16), the dialogue slot (A2 R29) and the notices (A2 R33). The
   * row of the world reported as this scene is created (the first world's, whose report launched it),
   * and each later world's on its report; the slot yielding as each report is heard (R20); the town's
   * card drawn as the town shows it, in the popup band over the row, and gone with its world (R32); each
   * notice drawn as a world says it, at its depth, gone with its world (R34). All taken down
   * as a world leaves and with the game, when it stops hearing the worlds (R4). The row's knockouts
   * follow the render scale themselves; a new logical view stands the row in the new corner, the
   * slot's panel at the new centre and the card in its corner.
   */
  private mountInterface(bridge: UiBridge): void {
    const menu = new UiMenuSlot({
      bridge,
      draw: {
        menu: (spec) => showMenuPanel(this, spec),
        options: (spec) => openOptionsPanel(this, spec),
      },
      through: (x, y) => this.corner?.covers(x, y, "menu") ?? false,
      centre: () => ({ x: viewport.centerX, y: viewport.centerY }),
      musicLevel: () => storedMusicLevel(browserMusicStore),
      fullscreen: () => lentFullscreen(this.registry),
      party: { isOpen: () => party.isOpen(), close: () => party.close() },
      gear: { isOpen: () => gear.isOpen(), close: () => void gear.close() },
      // Esc's first step (FS-84N1G R17)
      controls: { isOpen: () => this.controls?.isOpen() ?? false, dismiss: () => this.controls?.dismiss() },
    });
    const party = new UiPartySlot((world) => this.partyPieces(bridge, world));
    // the gear overlay and its source, and the container view, for each world (§ Change: Phase 3, R50)
    const gear = new UiGearSlot(bridge, (world, wiring) => mountGearPieces(this, () => this.residentArt(), world, wiring));
    const corner = new UiCornerRow(bridge, (icons) => new HudCorner(this, { icons }), () => menu.pressMenu(), party, {
      isInventoryOpen: () => gear.isInventoryOpen(),
      isCharacterOpen: () => gear.isCharacterOpen(),
      toggle: (window) => gear.toggle(window),
    });
    // the run's settlement record, drawn from its data at its anchor (§ Change: Phase 3, R57), and its
    // controls panel, the UI scene's own (R56)
    const record = new UiRecordSlot(
      bridge,
      (anchor, onClose, onHovered) => new SettlementRecord(this, anchor, onClose, onHovered),
      () => recordAnchor(viewport),
    );
    const controls = new UiControlsSlot(bridge, (onClose) => mountControlsPiece(this, onClose));
    this.controls = controls;
    this.record = record;
    // the controls badge over the run's ability card, toggling the panel as H does (FS-84N1G R4, R8)
    const badge = new UiControlsBadge(bridge, controls, (spec) => new ControlsBadge(this, spec));
    this.badge = badge;
    const dialogue = new UiDialogueSlot(bridge, (spec) => showDialogueCard(this, spec));
    const notices = new UiNoticeLayer(bridge, (notice, gone) => drawNotice(this, notice, gone));
    this.menu = menu;
    this.corner = corner;
    this.dialogue = dialogue;
    this.party = party;
    this.gear = gear;
    corner.show(bridge.world);
    // the container view's root first, so the gear overlay's objects, made at each open, draw over it
    gear.show(bridge.world);
    party.show(bridge.world);
    const stop = bridge.onWorld((report) => {
      menu.sync();
      dialogue.sync();
      notices.sync();
      corner.show(report);
      gear.show(report);
      party.show(report);
      record.world(report);
      controls.world(report);
      this.badge?.world(report);
    });
    const stopScreen = bridge.onScreen({
      dialogue: (shown) => dialogue.show(shown),
      notice: (notice) => notices.say(notice),
      partySeen: (state) => party.seen(state),
      gear: (message) => gear.hear(message),
      container: (message) => gear.hearContainer(message),
      record: (shown) => record.show(shown, bridge.world?.world ?? null),
      endPopped: () => {
        gear.endPopped();
        controls.close();
      },
      // the run's first floor in view: the controls panel opens by itself, silently (FS-84N1G R2)
      runBegun: () => controls.runBegun(),
      abilityCard: (up) => this.badge?.abilityCard(up),
    });
    relayoutOn(this, () => {
      corner.relayout();
      menu.relayout();
      dialogue.relayout();
      party.relayout();
      gear.relayout();
      record.relayout();
      controls.relayout();
      badge.relayout();
    });
    onSceneEnd(this, () => {
      stop();
      stopScreen();
      menu.close();
      dialogue.close();
      notices.clear();
      corner.destroy();
      party.destroy();
      gear.destroy();
      record.destroy();
      controls.destroy();
      badge.destroy();
      this.badge = undefined;
      this.gear = undefined;
      this.controls = undefined;
      this.record = undefined;
      this.menu = undefined;
      this.dialogue = undefined;
      this.corner = undefined;
      this.party = undefined;
    });
  }

  /**
   * The party pieces for `world`, on this scene (FS-TQZ5J § Change: Phase 2: the party, R36): the party
   * panel, refused by the world's report and the menu slot, its opening closing the town's letter
   * panel, its own inputs through the interface sounds (R38, R39); the invite prompt in every world and
   * the ready check in the town (it only happens there, FS-BJNYC R4), hidden as the world says, the
   * invites stacked above its chat window; the party frames in every world, fed the world's state
   * ticks, their busts cut from the resident art (R37, R38).
   */
  private partyPieces(bridge: UiBridge, world: World): PartyPieces {
    const wiring = partyPanelWiring(bridge);
    const prompts = partyPromptWiring(bridge);
    // the party's sounds on the game's one player (FS-WDM0X § Change pass 2 (party))
    const { play } = wiring;
    // a window drawn over the party panel covers its DOM invite field where they meet: the run's controls
    // panel (1200) and the settlement record (1600) (R62; FS-84N1G R20)
    const covered = (field: Rect) => [this.controls?.rect(), this.record?.rect()].some((over) => !!over && rectsMeet(over, field));
    const panel = mountPartyPanel(this, { ...wiring, covered });
    const prompt = mountPartyInvitePrompt(this, prompts.hidden, prompts.floor, play);
    const popups = world === "hub" ? [prompt, mountPartyReadyCheck(this, prompts.hidden, play)] : [prompt];
    const art = { resolve: (sheet: string, query?: FrameQuery) => this.residentArt().resolve(sheet, query) };
    const frames = mountPartyFrames(this, art, play);
    return { panel, rest: [...popups, frames] };
  }

  /**
   * The class sheets the frames' busts are cut from: resident art, loaded at boot (FS-C4JWH), so the
   * UI scene's own library over it resolves the frames a world's would; the game's textures are one
   * manager (§ Change: Phase 2: the party, R37).
   */
  private residentArt(): ArtLibrary {
    this.art ??= registerArt(this, RESIDENT_ART);
    return this.art;
  }
}
