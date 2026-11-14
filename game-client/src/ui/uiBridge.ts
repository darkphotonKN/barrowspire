/**
 * The UI bridge (FS-TQZ5J §B, ADR-0081 Decision 2): the one typed channel between the world scenes
 * and the UI scene. The world reports its state; the UI scene reports its own and asks the world for
 * what only the world can do. No scene imports another scene or calls its methods: each reaches the
 * bridge its game was lent, through {@link uiBridgeOf}, as it reaches the frame's fullscreen.
 *
 * One per game ({@link GameUiBridge}), made and lent by the game bridge (`PhaserGame`), let go with
 * the game. It is the channel only: the UI scene's life listens to its world reports
 * (`src/components/uiSceneLifecycle.ts`).
 *
 * Each slice of FS-TQZ5J adds to it what it consumes: so far which world is up and its leaving, its
 * open windows, its dialogue, its player state and the facts its menu rows read (R9), the UI's state
 * and the world hearing it change (R10), the corner row's and the ESC menu's requests the world
 * answers (R11), and the interface sounds the world's player actions and its minimap's step reach
 * through it (R12, R22). A pointer move the UI scene took from the world reaches the world through it
 * (A1 R27). The town's NPC dialogue crosses it as plain data, shown and taken down by the town, the
 * row picked handed back as its id (A2 R29, R30); so do the worlds' screen notices (A2 R33). Phase 3
 * adds the gear's, the container view's and the settlement record's data, the run's end appearing, the
 * UI's state in parts (the gear's panels, the container open) and the requests only the world can
 * answer for them: the run's equip and unequip, a take, the record's close (§ Change: Phase 3, R52–R54).
 */

import type { WorldType } from "@/assets/types/client";
import type { ContainerKind, ItemState } from "@/types/gameState";
import type { UiAct, UiActWrapper, UiEffect, WindowState } from "@/audio/uiSounds";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import type { GameRegistry } from "./gameFullscreen";
import type { CarriedState } from "./EquipmentHud";
import type { CharacterSource } from "./characterSheet";
import type { SeenState } from "./partyFramesLayout";
import type { RecordView } from "./settlement";
import type { HudMessage } from "./uiSceneHud";
import { hearMove, type InputCamera, type ScenePointer, type WorldInput } from "./uiScenePointer";

/** The world a world scene draws (FS-TQZ5J "Words"): the town, a field, a run, as the server names them. */
export type World = WorldType;

/**
 * Which of the world's own windows are open (R9): the town's letter panel. The ESC menu's slot, the
 * party panel and the gear overlay's Inventory and Character are the UI scene's own (R16; § Change:
 * Phase 2: the party, R39; § Change: Phase 3, R55). The interface sounds' rule reads them all
 * (FS-WDM0X S8).
 */
export type WorldWindows = Readonly<Omit<WindowState, "menu" | "party" | "inventory" | "character">>;

/** Who speaks on a dialogue card (A2 R29): the name, the role under it, the frame the bust is cut from. */
export interface DialogueSpeaker {
  readonly name: string;
  /** A few words of who they are, under the name. Residents and the Spire's door have none. */
  readonly role?: string;
  /** The frame the figure the player walked up to shows: the game's textures are one manager. */
  readonly portrait?: { readonly texture: string; readonly frame: string | number };
}

/**
 * How an answer sounds as it is picked (FS-WDM0X § Change: Menu, dialog and notice sounds, M15): an
 * ordinary option, a yes that sends the player on, an irreversible one, or a cancel.
 */
export type DialogueSound = "click" | "confirm" | "heavy" | "cancel";

/**
 * One answer on a dialogue card (A2 R29): its id, handed back when it is picked; its words, bare (the
 * UI scene puts its key on them); its register, the row's colour and key; whether it can be picked now;
 * how it sounds as it is picked, where it is not its register's (a cancel row `cancel`, any other
 * `click`; FS-WDM0X § Change M15).
 */
export interface DialogueOption {
  readonly id: string;
  readonly label: string;
  readonly register: "actionable" | "cancel";
  readonly enabled: boolean;
  readonly sound?: DialogueSound;
}

/** World → UI: a dialogue the world shows, whole, as plain data (A2 R29). Sent again on any change. */
export interface ShownDialogue {
  readonly speaker: DialogueSpeaker;
  readonly text: string;
  readonly options: readonly DialogueOption[];
}

/**
 * How a notice looks (A2 R33): the town's passing line, the field's, or the run's notification on its
 * backing colour (a colour value: the tone the run said it in).
 */
export type NoticeLook =
  | { readonly world: "hub" }
  | { readonly world: "field" }
  | { readonly world: "run"; readonly backing: number };

/** World → UI: a passing notice, as plain data (A2 R33). It plays no sound (FS-WDM0X § Change, owner listening check). */
export interface Notice {
  readonly text: string;
  readonly look: NoticeLook;
}

/**
 * What keeps the screen in the world (R9): the town's NPC dialogue, open; and the world's part of the
 * party pieces' rules (§ Change: Phase 2: the party, R38), each false where a report leaves it out.
 */
export interface WorldBlockers {
  readonly dialogue: boolean;
  /**
   * The world turns T and the Party icon away now: the town's dialogue, the run's end or an open
   * chest. The UI scene refuses the party panel while this is true or its menu slot is filled.
   */
  readonly party?: boolean;
  /**
   * The world hides the invite prompts and the ready check now: its rule whole (the town: the menu,
   * the gear overlay or the letter panel; the run: its end).
   */
  readonly popups?: boolean;
  /**
   * The world turns the gear overlay away now: the town's dialogue (§ Change: Phase 3, R55). The UI
   * scene refuses it while this is true or its menu slot is filled.
   */
  readonly gear?: boolean;
}

/** Where the world's own HUD stands, as the UI scene's pieces keep clear of it (§ Change: Phase 2: the party, R38). */
export interface WorldLayout {
  /** The screen y the invite stack stays above: the chat window's top edge, where the world has one. */
  readonly chatTop?: number;
}

/**
 * What the world's ESC menu rows read (R9, R16): the player's state and the menu facts, each false
 * where the world has no such thing (a field is never queued; only the run resolves, ends or falls).
 */
export interface WorldFacts {
  /** Out of the delve, dead or escaped (the run's `menuState`): the run's rows are `runMenuChoices`' for it. */
  readonly resolved: boolean;
  /** In the town's queue: the town's menu offers Leave the queue (`hubMenuChoices`). */
  readonly queued: boolean;
  /** A Change character sent and unanswered: its row is dimmed. */
  readonly leaving: boolean;
  /** The run has ended: no menu opens, and the keys are the run's end's (its keyboard is off). */
  readonly ended: boolean;
  /** A Leave the barrow sent and unanswered: its row is dimmed. */
  readonly leavePending: boolean;
  /** A Fall sent and unanswered: the Fall confirm's Fall is dimmed. */
  readonly fallPending: boolean;
}

/** A world's facts where it has none of them. */
export const NO_FACTS: WorldFacts = {
  resolved: false,
  queued: false,
  leaving: false,
  ended: false,
  leavePending: false,
  fallPending: false,
};

/**
 * What the UI scene asks the world to close (R11, R17): the letter panel, the dialogue; the run's
 * settlement record, its Close (§ Change: Phase 3, R57). The party panel and the gear overlay are the
 * UI scene's own (§ Change: Phase 2, R39; § Change: Phase 3, R55).
 */
export type UiClose = "letter" | "dialogue" | "record";

/**
 * UI → world: what the UI scene asks of the world (R11). An Esc step's `close`; the ESC menu's rows that only the world can do (the town's and the field's
 * `leaveQueue` and `changeCharacter`, the run's `leaveRun` and `fall`); and the OPTIONS Music row's
 * `musicLevel`, which the world playing music applies at once (R19); a dialogue card's row picked, by its
 * id (`pickDialogue`, A2 R30). Plain data: nothing callable.
 */
export type UiRequest =
  | { readonly kind: "close"; readonly window: UiClose }
  | { readonly kind: "leaveQueue" }
  | { readonly kind: "changeCharacter" }
  | { readonly kind: "leaveRun" }
  | { readonly kind: "fall" }
  | { readonly kind: "musicLevel"; readonly level: number }
  | { readonly kind: "pickDialogue"; readonly id: string }
  /** The gear overlay wore or took off an item: the run's Equip or Unequip, by its entity id (§ Change: Phase 3, R54). */
  | { readonly kind: "equip" | "unequip"; readonly item: string }
  /** The container view took an item: the world sends its loot, and says `gear: taken` if it did (R54). */
  | { readonly kind: "take"; readonly item: ItemState };

/** World → UI: the world's report, whole (R9). */
export interface WorldReport {
  readonly world: World;
  /**
   * Its windows as they are now, read rather than told: they change behind the world's back (a
   * module's own ×, a server message), and they are read only around a player action (R12).
   */
  readonly windows: () => WorldWindows;
  /** What keeps its screen now, read as its windows are. */
  readonly blockers: () => WorldBlockers;
  /** What its ESC menu's rows read now (R9, R16), read as its windows are. */
  readonly facts: () => WorldFacts;
  /** Where its own HUD stands now, read as its windows are; none, nothing to keep clear of. */
  readonly layout?: () => WorldLayout;
  /**
   * Hears the UI's state change (R10), with what it was: as the menu opens the world closes its windows
   * (FS-3EBCA R17) and ends an aim (FS-JTNPR req 15); its stride stops on its next frame, its guards
   * reading the state (FS-G4VMQ R5); a gear panel opening ends an aim too (§ Change: Phase 3, R53).
   * Heard inside the act that changed it, so the sounds hear it too (R22).
   */
  readonly heardUi?: (ui: UiState, was: UiState) => void;
  /** Answers a request of the UI scene's at once, or ignores one it has no answer for (R11). */
  readonly answer: (request: UiRequest) => void;
  /**
   * Hears a pointer move the UI scene took (A1 R27), through its own input pass, over nothing of its
   * own while the pointer is over a UI piece (`onUi`). `reportWorld` gives each world one; a report
   * without one hears nothing.
   */
  readonly hearMove?: (pointer: ScenePointer, onUi: boolean) => void;
}

/** What a world hands with its name: everything of its report but the world and the moves `reportWorld` hears for it (R9). */
export type WorldSide = Omit<WorldReport, "world" | "hearMove">;

/** A world's answer to each request it has one for (R11): a close by what it closes. */
export type WorldAnswers = {
  readonly close?: Partial<Record<UiClose, () => void>>;
  readonly leaveQueue?: () => void;
  readonly changeCharacter?: () => void;
  readonly leaveRun?: () => void;
  readonly fall?: () => void;
  readonly musicLevel?: (level: number) => void;
  readonly pickDialogue?: (id: string) => void;
  readonly equip?: (item: string) => void;
  readonly unequip?: (item: string) => void;
  readonly take?: (item: ItemState) => void;
};

/** The world's `answer` from its answers: each request to its own, one with none ignored (R11). */
export function answering(answers: WorldAnswers): (request: UiRequest) => void {
  return (request) => {
    switch (request.kind) {
      case "close":
        return answers.close?.[request.window]?.();
      case "musicLevel":
        return answers.musicLevel?.(request.level);
      case "pickDialogue":
        return answers.pickDialogue?.(request.id);
      case "equip":
      case "unequip":
        return answers[request.kind]?.(request.item);
      case "take":
        return answers.take?.(request.item);
      default:
        return answers[request.kind]?.();
    }
  };
}

/**
 * UI → world: the UI's state (R10), each part reported by the piece it is (§ Change: Phase 3, R53): the
 * menu slot, the gear overlay's panels, the container view. A part left out is shut.
 */
export interface UiState {
  /** The ESC menu's slot is filled: the menu, OPTIONS or the run's Fall confirm. */
  readonly menuOpen: boolean;
  /** The gear overlay's inventory is open, in stash mode or not. */
  readonly inventory?: boolean;
  /** The gear overlay's character panel is open. */
  readonly character?: boolean;
  /** The gear overlay is open in stash mode (the town's stash chest). */
  readonly stash?: boolean;
  /** The container the container view is open for; none, it is shut. */
  readonly container?: string;
}

/**
 * World → UI: the gear overlay's data (§ Change: Phase 3, R52): what a state tick hands it (what the
 * player carries and wears, in a field and the run; the player's own state, for the stats panel), the
 * level, an item the world sent a loot for, the town's stash chest opened, the town's letter panel
 * taking the screen.
 */
export type GearMessage =
  | { readonly kind: "seen"; readonly carried?: CarriedState; readonly character?: CharacterSource }
  | { readonly kind: "level"; readonly level: number | undefined }
  | { readonly kind: "taken"; readonly item: ItemState }
  | { readonly kind: "openStash" }
  | { readonly kind: "close" };

/**
 * World → UI: the container view's data (R52): a container opened (its entity and its kind, the view's
 * face), its items, its close (`now`: unanimated, the world ending).
 */
export type ContainerMessage =
  | { readonly kind: "open"; readonly entityId: string; readonly container: ContainerKind }
  | { readonly kind: "items"; readonly items: readonly ItemState[] }
  | { readonly kind: "close"; readonly now?: boolean };

/** World → UI: the run's settlement record, its view and whether it is up (R52, R57). */
export interface ShownRecord {
  readonly view: RecordView;
  readonly open: boolean;
}

/** The parts of the UI's state, as a key: two states with the same key are the same state. */
const uiKey = (ui: UiState) =>
  [ui.menuOpen, !!ui.inventory, !!ui.character, !!ui.stash, ui.container ?? ""].join("|");

/**
 * What the UI scene draws for the worlds, told as the world says it (A2 R29, R33): its dialogue, or
 * none; a notice; each state tick the party frames read (§ Change: Phase 2: the party, R38).
 */
export interface UiScreen {
  dialogue?(shown: ShownDialogue | null): void;
  notice?(notice: Notice): void;
  partySeen?(state: SeenState): void;
  gear?(message: GearMessage): void;
  container?(message: ContainerMessage): void;
  record?(shown: ShownRecord | null): void;
  endPopped?(): void;
  abilityCard?(up: boolean): void;
  /** A HUD piece's data the world hands (§ Change: Batch 5, R68). */
  hud?(message: HudMessage): void;
}

/** The UI scene's interface sounds as the bridge reaches them: the game's one `UiSounds` is one (R22). */
export interface UiSoundPlayer {
  act: UiAct;
  play(effect: UiEffect): void;
}

/**
 * The bridge as the scenes see it. Every call is synchronous: when it returns, the other side has
 * heard it. Its `act` is the wrapper a world runs each player action that can open or close a
 * window through (R12).
 */
export interface UiBridge extends UiActWrapper {
  /** The world's report: as its create runs, and again on any change (R9). */
  report(report: WorldReport): void;
  /** The world has shut down (R9). */
  left(world: World): void;
  /** The world's last report; none outside the worlds. What the UI scene reads. */
  readonly world: WorldReport | null;
  /** Hears each world report from now on, and none (null) as a world leaves. Returns the stop. */
  onWorld(listener: WorldListener): () => void;
  /** The UI scene asks the world reported, which has answered when this returns; none reported, nothing (R11). */
  request(request: UiRequest): void;
  /**
   * A pointer move Phaser stopped at the UI scene, handed to the world reported, which has heard it
   * when this returns; `onUi` while the pointer is over a UI piece. None reported, nothing (A1 R27).
   */
  moved(pointer: ScenePointer, onUi: boolean): void;
  /**
   * The UI scene's report of a part of its own state (R10; § Change: Phase 3, R53), merged into the
   * rest: a change is heard by the world reported at once (`heardUi`), with what it was.
   */
  reportUi(part: Partial<UiState>): void;
  /**
   * The world reported changed a part of its report (R9): its listeners hear it again at once, so the
   * UI scene reads the new facts in the same call (its menu yields, its rows retone).
   */
  changed(): void;
  /** The UI's last state. What the world's guards read. */
  readonly ui: UiState;
  /**
   * True while the world hears a move the UI scene took over one of its pieces (A1 R27), and only
   * then: a world piece that hovers by coordinates gives way to the UI scene there (§ Change: Phase 2:
   * the party, R41).
   */
  readonly overUi: boolean;
  /**
   * A world's player action, run through the UI scene's interface sounds: the world's windows read
   * before and after, once, and the rule's one effect played; one inside another joins it (R12,
   * R22). Before the UI scene lends its sounds it runs as it is.
   */
  act: UiAct;
  /** An effect the world's own input plays: its minimap's mode step (FS-WDM0X S7). */
  play(effect: UiEffect): void;
  /** The UI scene lends the game's one player, as it is created (R22). */
  lendSounds(sounds: UiSoundPlayer): void;
  /** The world shows a dialogue, or shows it again changed (A2 R29): the UI scene draws it at once. */
  showDialogue(shown: ShownDialogue): void;
  /** The world takes its dialogue down (A2 R29). */
  closeDialogue(): void;
  /** The world says a passing notice (A2 R33): the UI scene draws it at once. */
  notice(notice: Notice): void;
  /**
   * The world hands a state tick it showed (§ Change: Phase 2: the party, R38), as plain data: the
   * party frames' bars and levels follow it at once.
   */
  partySeen(state: SeenState): void;
  /** The world hands the gear overlay its data (§ Change: Phase 3, R52): the UI scene has it when this returns. */
  gear(message: GearMessage): void;
  /** The world opens, fills or closes the container view (R52). */
  container(message: ContainerMessage): void;
  /** The run hands its settlement record, or none (R52, R57). */
  record(shown: ShownRecord | null): void;
  /**
   * The run's end appeared, or an escaped player's WATCH and LEAVE were first offered with a teammate
   * still in play (R58): the moved windows step aside, silently.
   */
  endPopped(): void;
  /** The run's ability card came up or went (FS-84N1G R4): the controls badge stands over it while it is up. */
  abilityCard(up: boolean): void;
  /** Hears what the worlds say to the screen from now on (A2 R29, R33). Returns the stop. */
  onScreen(screen: UiScreen): () => void;
  /**
   * The world hands a HUD piece its data (§ Change: Batch 5, R68): the ability card, the potion cell, the
   * bars, the level bar. The UI scene has drawn it when this returns.
   */
  hud(message: HudMessage): void;
}

/**
 * What of the bridge a world scene reaches (R10, R12, A2 R29, R33): its player actions and its
 * minimap's step, the UI's state its guards read, its word that its report changed, its dialogue and
 * its notices.
 */
export type WorldUi = Pick<
  UiBridge,
  | "act"
  | "play"
  | "ui"
  | "overUi"
  | "changed"
  | "showDialogue"
  | "closeDialogue"
  | "notice"
  | "partySeen"
  | "gear"
  | "container"
  | "record"
  | "endPopped"
  | "abilityCard"
  | "hud"
>;

/** A world's UI in a game lent no bridge: each action runs as it is, nothing plays or is drawn, no menu is open. */
export const NO_UI: WorldUi = {
  act: (run) => run(),
  play: () => {},
  ui: { menuOpen: false },
  overUi: false,
  changed: () => {},
  showDialogue: () => {},
  closeDialogue: () => {},
  notice: () => {},
  partySeen: () => {},
  gear: () => {},
  container: () => {},
  record: () => {},
  endPopped: () => {},
  abilityCard: () => {},
  hud: () => {},
};

/** Told each world report, and none (null) as the world reported leaves. */
export type WorldListener = (report: WorldReport | null) => void;

/**
 * The game's UI bridge (R8): what the scenes said, held for the other side to read, and each world
 * report told to whoever listens (the UI scene's life). It knows nothing of the game's scenes.
 */
export class GameUiBridge implements UiBridge {
  private reported: WorldReport | null = null;
  private uiState: UiState = { menuOpen: false };
  private readonly listeners = new Set<WorldListener>();
  private readonly screens = new Set<UiScreen>();
  private sounds: UiSoundPlayer | null = null;
  private movingOverUi = false;

  get world(): WorldReport | null {
    return this.reported;
  }

  get ui(): UiState {
    return this.uiState;
  }

  get overUi(): boolean {
    return this.movingOverUi;
  }

  report(report: WorldReport): void {
    this.reported = report;
    this.tell(report);
  }

  /** A left from a world no longer the one reported changes nothing, and tells nothing. */
  left(world: World): void {
    if (this.reported?.world !== world) return;
    this.reported = null;
    this.tell(null);
  }

  reportUi(part: Partial<UiState>): void {
    const was = this.uiState;
    const next = { ...was, ...part };
    if (uiKey(next) === uiKey(was)) return;
    this.uiState = next;
    this.reported?.heardUi?.(next, was);
  }

  changed(): void {
    if (this.reported) this.tell(this.reported);
  }

  request(request: UiRequest): void {
    this.reported?.answer(request);
  }

  moved(pointer: ScenePointer, onUi: boolean): void {
    const was = this.movingOverUi;
    this.movingOverUi = onUi;
    try {
      this.reported?.hearMove?.(pointer, onUi);
    } finally {
      this.movingOverUi = was;
    }
  }

  act: UiAct = (run) => (this.sounds ? this.sounds.act(run) : run());

  play(effect: UiEffect): void {
    this.sounds?.play(effect);
  }

  lendSounds(sounds: UiSoundPlayer): void {
    this.sounds = sounds;
  }

  onWorld(listener: WorldListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  showDialogue(shown: ShownDialogue): void {
    for (const screen of [...this.screens]) screen.dialogue?.(shown);
  }

  closeDialogue(): void {
    for (const screen of [...this.screens]) screen.dialogue?.(null);
  }

  notice(notice: Notice): void {
    for (const screen of [...this.screens]) screen.notice?.(notice);
  }

  partySeen(state: SeenState): void {
    for (const screen of [...this.screens]) screen.partySeen?.(state);
  }

  gear(message: GearMessage): void {
    for (const screen of [...this.screens]) screen.gear?.(message);
  }

  container(message: ContainerMessage): void {
    for (const screen of [...this.screens]) screen.container?.(message);
  }

  record(shown: ShownRecord | null): void {
    for (const screen of [...this.screens]) screen.record?.(shown);
  }

  endPopped(): void {
    for (const screen of [...this.screens]) screen.endPopped?.();
  }

  abilityCard(up: boolean): void {
    for (const screen of [...this.screens]) screen.abilityCard?.(up);
  }

  hud(message: HudMessage): void {
    for (const screen of [...this.screens]) screen.hud?.(message);
  }

  onScreen(screen: UiScreen): () => void {
    this.screens.add(screen);
    return () => void this.screens.delete(screen);
  }

  private tell(report: WorldReport | null): void {
    for (const listener of [...this.listeners]) listener(report);
  }
}

const UI_BRIDGE_KEY = "uiBridge";

/** Lends the game its UI bridge (R8). */
export function lendUiBridge(registry: Pick<GameRegistry, "set">, bridge: UiBridge): void {
  registry.set(UI_BRIDGE_KEY, bridge);
}

/** The UI bridge this scene's game was lent, or none: none lent, no game. */
export function uiBridgeOf(registry: Pick<GameRegistry, "get"> | undefined): UiBridge | null {
  return (registry?.get(UI_BRIDGE_KEY) as UiBridge | undefined) ?? null;
}

/**
 * A world scene, as far as it reports its world: its game's registry, its end, and the input and
 * cameras a move the UI scene took runs through (A1 R27). A `Phaser.Scene` is one: its input's
 * `update` is Phaser's own pass over a DOM event, private in 4.2.1's types (pinned by test).
 */
export interface ReportingScene extends EndingScene {
  registry?: Pick<GameRegistry, "get">;
  input?: unknown;
  cameras?: { readonly cameras: readonly InputCamera[] };
}

/** The scene's input as a move runs through it, where it has one. */
function worldInput(scene: ReportingScene): WorldInput<ScenePointer> | null {
  const input = scene.input as Partial<WorldInput<ScenePointer>> | null | undefined;
  return typeof input?.update === "function" ? (input as WorldInput<ScenePointer>) : null;
}

/**
 * Reports `world` up, now, with its side (its windows, its blockers, its answers) and its ear for a
 * move the UI scene took (A1 R27), and its leaving on the scene's stop (R3, R9, R11). Called once per
 * start, from create, before anything that hears a player. On the game's destroy it tells nothing:
 * the UI scene goes with the game, and the scene manager going down is asked nothing (R4,
 * `SceneEnd`). Returns what the world's player actions and its minimap's step run through (R12): its
 * game's bridge, or {@link NO_UI} where none was lent.
 */
export function reportWorld(scene: ReportingScene, world: World, side: WorldSide): WorldUi {
  const bridge = uiBridgeOf(scene.registry);
  if (!bridge) return NO_UI;
  const input = worldInput(scene);
  const hear = (pointer: ScenePointer, onUi: boolean) => {
    if (input) hearMove(input, scene.cameras?.cameras ?? [], pointer, onUi);
  };
  bridge.report({ world, ...side, hearMove: hear });
  onSceneEnd(scene, (end) => {
    if (end === "shutdown") bridge.left(world);
  });
  return bridge;
}

/**
 * The container view as a world reaches it (FS-TQZ5J § Change: Phase 3, R52, R53): what it was open for
 * read from the UI's state, its open, items and close told through the bridge. A field's `FieldPiles`
 * takes it as its satchel; the run drives it as it drove the view. `ui` is read at each call, as a world
 * reports itself in its create.
 */
export interface WorldContainer {
  readonly isOpen: boolean;
  readonly entityId: string | undefined;
  open(entityId: string, kind: ContainerKind): void;
  close(): void;
  /** Closed at once, nothing animated: the world is ending. */
  closeNow(): void;
  setItems(items: readonly ItemState[]): void;
}

export function worldContainer(ui: () => Pick<WorldUi, "ui" | "container">): WorldContainer {
  return {
    get isOpen() {
      return ui().ui.container !== undefined;
    },
    get entityId() {
      return ui().ui.container;
    },
    open: (entityId, kind) => ui().container({ kind: "open", entityId, container: kind }),
    close: () => ui().container({ kind: "close" }),
    closeNow: () => ui().container({ kind: "close", now: true }),
    setItems: (items) => ui().container({ kind: "items", items }),
  };
}

/**
 * Whether a gear panel opened between two of the UI's states (§ Change: Phase 3, R53): the world ends
 * a Shadow Shot hold as the inventory or the character panel opens (FS-JTNPR req 15).
 */
export function gearOpened(ui: UiState, was: UiState): boolean {
  return (!!ui.inventory && !was.inventory) || (!!ui.character && !was.character);
}
