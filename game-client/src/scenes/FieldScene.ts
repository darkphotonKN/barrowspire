import * as Phaser from "phaser";
import { ActionType, type FieldId } from "@/assets/types/client";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import type { ClientGameState, GateState, PlayerState, Position, PublicPlayerState, WallState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import { ensureCharacterTextures, placeholderTexture } from "@/utils/characterTextures";
import {
  addWorldPlane,
  facingFrom,
  nearestScreenFacing,
  projectedBounds,
  standAt,
  worldToScreen,
  type Facing8,
  type Point,
} from "@/render/iso";
import { preloadArt, registerArt } from "@/render/art/phaser";
import { fieldArt } from "@/render/art/sceneArt";
import { drawTorchBar } from "@/ui/torchBar";
import type { ArtLibrary } from "@/render/art/library";
import { CharacterAnimator } from "@/render/art/character";
import { LightMap } from "@/render/lighting";
import { FIELD_MARKER_OUTLINE, MARKER_DEPTH } from "@/render/markers";
import {
  GroundLayer,
  MEADOWS_LOOK,
  Occluders,
  addDressing,
  addProp,
  fieldLook,
  forestStatics,
  planKeepOutDressing,
  planRoadHome,
  planTreeStands,
  planVerges,
  showState,
  standSheet,
  worldSeed,
  type FieldLook,
} from "@/render/world";
import { addMist } from "@/render/effects/mist";
import { DROP_PILE, paintDropPile } from "@/render/world/dropPile";
import { CHEST, chestFrame, paintChest } from "@/render/world/chest";
import { SACK, paintSack, sackFrame } from "@/render/world/sack";
import { abilityCard } from "@/ui/abilityCard";
import { hudBars } from "@/ui/resources";
import { createAtmosphere } from "@/utils/atmosphere";
import { fieldCombatOnScene, type FieldCombat } from "./fieldCombat";
import { FieldPiles } from "./fieldPiles";
import { onSceneEnd, releaseCaptures, type SceneEnd } from "./sceneEnd";
import {
  NO_FACTS,
  NO_UI,
  answering,
  gearOpened,
  reportWorld,
  worldContainer,
  type WorldSide,
  type WorldUi,
  type WorldWindows,
} from "@/ui/uiBridge";
import {
  COUNTDOWN_SECONDS_PX,
  countdownSecondsText,
  drawCountdownBar,
} from "@/ui/countdownBar";
import type { Rect } from "@/ui/partyPanelLayout";
import { FALLEN_LINE, FallenCountdown, fallenFrame, isFallen } from "./fieldFallen";
import { fieldRefusalCopy } from "./fieldRefusals";
import { gateAt, gateEdges } from "./hubGates";
import { afterFrameSetUp, boundCamera, followWith, relayoutOn, viewport } from "@/render/viewport";
import { usePartyStore } from "@/stores/partyStore";
import { useGameStore } from "@/stores/gameStore";
import { browserFieldChartStore, type FieldChartStore } from "@/ui/fieldChart";
import { FieldChartKeeper } from "@/ui/fieldChartKeeper";
import { fieldMap } from "@/ui/fieldMap";
import type { MinimapStage } from "@/ui/minimap";
import { browserMinimapStore, type MinimapModeStore } from "@/ui/minimapMode";
import type { ModeIconStage } from "@/ui/minimapModeIcon";
import { canvasImage } from "@/ui/paintKit";
import { WorldMinimapController, bindMinimapKey } from "@/ui/worldMinimapController";
import { ArrivalCard, cardLeaves } from "@/ui/arrivalCard";
import { minimapPlaceName } from "@/ui/minimapName";
import { placeCard } from "@/ui/placeCard";
import { findPointerLook } from "@/render/cursors";

/**
 * A field world (FS-X2F2H §H): the ground, the player and the others in this pod's channel, the
 * field's keep-out areas and its entrance gate, the road home. Each field is drawn in its own look
 * (`fieldLook`, keyed by the field id from world_entered): its daylit ground, its ambient, trees
 * and rocks on the server's keep-outs, and past the map's edge only its flat edge tint, the ground
 * fading into it (FS-KSD6K §Requirements 14, 16). Monsters
 * and the fight with them are the run scene's own pieces, composed in `fieldCombat`; drop piles
 * and the satchel they are taken through, in `fieldPiles`, a pile held for someone else's kill
 * drawn faint and not offered (§Requirements 56, 59). The equip HUD is the run's own
 * (on the gear and bag overlay, FS-HRH2J), on the run's keys: I or B opens it,
 * E over it equips, and a full bag refuses pickups and unequips with the field's notice. The overlay,
 * the satchel and their keys are the UI scene's: the field hands them its state and answers their
 * equips and takes (FS-TQZ5J § Change: Phase 3, R50–R56).
 * The class kit is the run's too (FS-8AY7S, FS-JTNPR, FS-MAMHR): the Health and class resource
 * bars top-left, the ability card bottom-right, the archer's Shadow Shot hold (the keys read
 * released while it is drawn) and the Mercenary's cut, riposte and parry, all through `fieldCombat`.
 *
 * Walking into the entrance gate sends one leave_field and waits for world_entered or a refusal,
 * as the hub does for its own sends (§Requirements 57).
 *
 * A fallen player lies in the run scene's death pose under a short fallen state counting 3-2-1,
 * then stands at the entrance: no result card, no loss copy (§Requirements 58). The wait wears the
 * shared countdown, its bar draining along the panel's foot (FS-B3NDZ R12).
 */

/** Each field's size in world px, as the server builds it (FS-X2F2H §Requirements 51). */
const FIELD_SIZE: Record<FieldId, { width: number; height: number }> = {
  gentle_meadows: { width: 2000, height: 1000 },
  // 39 x 25 cells of 80 px, constants.ForestMapWidth/Height (FS-KSD6K §Requirements 1, 17)
  forlorn_forest: { width: 3120, height: 2000 },
  dev_test_room: { width: 900, height: 600 },
};

const CAMERA_MARGIN = 120;
const POSITION_LERP = 0.3;
const NAME_GAP = 4;
/** The fallen state's depth, as it has always stood: the HUD's. */
const FALLEN_DEPTH = 1000;
/** The fallen line's size, as it has always been. */
const FALLEN_LINE_PX = 18;
/** What the entrance gate is called on the ground, for a player to walk to. */
const ROAD_HOME = "The road home";
/** The baked signpost the road home's name hangs over, as at the hub's field gates. */
const SIGNPOST = "signpost";
/** Every marker's dark outline in a field, so it reads on daylit ground (guideline "Daylit fields"). */
const FIELD_MARKER_STROKE = {
  stroke: toCss(FIELD_MARKER_OUTLINE.color),
  strokeThickness: FIELD_MARKER_OUTLINE.thickness,
};

/** A server wall's rect. */
function rectOfWall(wall: WallState): { x: number; y: number; width: number; height: number } {
  return { x: wall.position.x, y: wall.position.y, width: wall.width, height: wall.height };
}

/** The field's entrance gate: the one gate that leads to the hub. */
function roadHomeGate(gates: readonly GateState[]): GateState | undefined {
  return gates.find((gate) => gate.destination === "hub");
}

interface PlayerView {
  sprite: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  pos: Point;
  target: Point;
  facing: Facing8;
  anim: CharacterAnimator;
  /** At 0 HP by the last state: drawn in the death pose, and snapped, not eased, when they rise. */
  fallen: boolean;
}

export class FieldScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  /**
   * The last move this visit sent, which the field body walks; none yet at a start. The body may
   * be walking already: the server routes a move by the player's record, which the world left
   * moves here before the client hears of it, so that world's last move may walk the field body.
   * The first frame sends whatever the keys say.
   */
  private lastSent?: { vx: number; vy: number };

  private field: FieldId = "gentle_meadows";
  /**
   * Whether this start is an arrival (FS-PQ2TW R5–R8): decided once, at the world switch, and
   * handed over in the start data. A start with no verdict is no arrival. An arrival plays the
   * field's card from `create`; a return plays nothing.
   */
  private arrival = false;
  /** How this field is drawn, by its id (FS-X2F2H §Requirements 54). */
  private look: FieldLook = MEADOWS_LOOK;
  private size = FIELD_SIZE.gentle_meadows;
  /** Trees and the signpost, faded while they stand over the player (FS-2325V §C.5). */
  private occluders = new Occluders();
  private art!: ArtLibrary;
  private lightMap?: LightMap;
  private views = new Map<string, PlayerView>();
  private selfEntityID: string | null = null;
  private followedSprite?: unknown;
  /** Drawn once: a field's keep-out areas and entrance never move. */
  private groundDrawn = false;
  private obstaclesDrawn = false;
  private entranceDrawn = false;
  /** The road home the player stands in, by their server-reported position (§Requirements 57). */
  private atEntrance?: GateState;
  /** A leave_field has been sent and its reply has not come (§Requirements 57). */
  private leavingField = false;
  /** The field's monsters and the player's fight with them (§Requirements 56). */
  private fight?: FieldCombat;
  /** A leave_hub has been sent from the menu and not answered yet (FS-G4VMQ R25). */
  private leavingHub = false;
  /** The player's own fall and its 3-2-1 (§Requirements 58). */
  private fallen = new FallenCountdown();
  /** The fallen state on screen: its panel, line, number and countdown bar (FS-B3NDZ R12). */
  private fallenView?: {
    panel: Phaser.GameObjects.Graphics;
    bar: Phaser.GameObjects.Graphics;
    barRect: Rect;
    line: Phaser.GameObjects.Text;
    seconds: Phaser.GameObjects.Text;
  };
  /**
   * The field's drop piles and the run's satchel they are taken through (§Requirements 56, 59): the
   * satchel the UI scene's, reached through the bridge (FS-TQZ5J § Change: Phase 3, R52, R53).
   */
  private piles?: FieldPiles;
  /**
   * The field's minimap at the top of the top-right column (FS-P0HSP): built with the field's
   * first state, from the stage create wires; gone with the visit.
   */
  private minimap?: WorldMinimapController;
  /** What the field's minimap draws with: the scene's graphics, its canvas images and the camera's frames. */
  private minimapStage?: MinimapStage;
  /** The map mode icon's own stage, its glyph and hint (FS-56CKV §Change: Map mode icon): the scene's graphics and text. */
  private modeIconStage?: ModeIconStage;
  /**
   * This visit's charted ground (FS-P0HSP §D), the player's own, read at the first state for the
   * active character then, and when its map redraws and its browser write are due.
   */
  private charting?: FieldChartKeeper;
  /** Where this browser keeps charted ground (ADR-0078). */
  private readonly chartStore: FieldChartStore = browserFieldChartStore;
  /** The field's walls and gates as last sent: what its map is built from with the chart. */
  private mapField: { walls: readonly WallState[]; gates: readonly GateState[] } = { walls: [], gates: [] };
  /** Where this browser keeps the minimap's mode, the run's key (FS-1SEF0 §A.4; FS-P0HSP §F.32). */
  private readonly minimapStore: MinimapModeStore = browserMinimapStore;
  /**
   * What the player's actions that can open or close a window, and the minimap's step, run through:
   * the game's UI bridge, to the UI scene's interface sounds (FS-TQZ5J R12, R22; FS-WDM0X S9). Its
   * game's, from create on, before anything that hears a player; until then, and in a game lent no
   * bridge, each action runs as it is. Nothing the game does on its own comes through here (S4).
   */
  private ui: WorldUi = NO_UI;
  /** The latest field state, for the ability card's redraw as the lockout starts and ends. */
  private lastState?: ClientGameState;
  /** The player's server-reported position, for reaching a pile. */
  private selfAt?: Point;
  private unsubscribeState?: () => void;
  /**
   * The field's arrival card (FS-PQ2TW R37): the shared piece's, told once the field's first state
   * is drawn, and leaves as the card's one switch says, ash (FS-PQ2TW §Change: Ash R53). It lets
   * its own card go at a scene end.
   */
  private readonly arrivalCard = new ArrivalCard(this, cardLeaves(this, () => this.art));

  constructor() {
    super({ key: "FieldScene" });
  }

  /**
   * The field this start is for, from the start data: Phaser hands it to `init` and `create`,
   * never to `preload`, which loads this field's own creatures (FS-C4JWH §B R8). And whether it
   * is an arrival (FS-PQ2TW R8).
   */
  init(data?: { field?: FieldId; arrival?: boolean }): void {
    this.field = data?.field ?? "gentle_meadows";
    this.arrival = data?.arrival ?? false;
    // what the body walks is not known at a start: the first frame says (reported 2026-11-12)
    this.lastSent = undefined;
  }

  preload(): void {
    preloadArt(this, fieldArt(this.field), {
      bar: () => drawTorchBar(this),
      fadeIn: true,
    });
  }

  create(): void {
    // an arrival is dark before anything of the field is made: the world's fade-in opens on the
    // dark, and the field's name, known now, comes after its dark hold (FS-PQ2TW R11, R13)
    if (this.arrival) this.arrivalCard.play(placeCard({ world: "field", field: this.field }), { built: false });
    // the UI scene comes up over this world, and sleeps when it stops; the player's actions reach
    // its interface sounds from here on (FS-TQZ5J R3, R9, R12)
    this.ui = reportWorld(this, "field", this.worldSide());
    this.look = fieldLook(this.field);
    this.size = FIELD_SIZE[this.field] ?? FIELD_SIZE.gentle_meadows;
    const { width, height } = this.size;

    const camera = this.cameras.main;
    const bounds = projectedBounds(width, height, CAMERA_MARGIN);
    boundCamera(camera, bounds);

    ensureCharacterTextures(this);
    this.art = registerArt(this, fieldArt(this.field));
    // past the map's edge, the field's flat edge tint and nothing else; the ground, laid with the
    // first state, road and all, fades into it (FS-KSD6K §Requirements 14, 16)
    camera.setBackgroundColor(this.look.beyond);
    this.bindInput();

    // the field's daylight, no torch-lit dark; the vignette and dust stay, as in every world
    // (FS-X2F2H §Requirements 54, guideline "Lighting")
    this.lightMap = new LightMap(this, this.look.ambient);
    createAtmosphere(this);
    // a forest's low mist over its ground, under everything standing (FS-3QHQZ §Requirements 27)
    if (this.look.mist) addMist(this, this.look.mist, worldSeed("field"));
    this.fight = fieldCombatOnScene(this, this.art, this.lightMap, {
      selfAnim: () => this.selfView()?.anim,
      selfAt: () => this.selfView()?.pos,
      bodyOf: (entityID) =>
        this.views.get(entityID)?.sprite.getByName("body") as Phaser.GameObjects.Sprite | undefined,
      takesPointer: (x, y, primary) => this.takesPointer(x, y, primary),
      // a press on the UI scene's chat window during a held world press (FS-TQZ5J § Change: Batch 6, R129)
      pressClaimed: (pointer) => this.ui.pressClaimed(pointer),
      lockout: () => this.showAbilityCard(),
    });
    this.createPiles();
    this.bindHudKeys();
    this.bindMinimapKey();
    // the field's minimap, built with its first state (FS-P0HSP §A.1); as the overlay, held
    // against the screen from the main camera's frames (FS-1SEF0 §C.19)
    this.minimapStage = {
      graphics: () => this.add.graphics(),
      canvasImage: (...image) => canvasImage(this, ...image),
      frames: (listener) => afterFrameSetUp(this.cameras.main, listener),
    };
    // the map mode icon's, apart from the map's layers (FS-56CKV §Change: Map mode icon)
    this.modeIconStage = {
      graphics: () => this.add.graphics(),
      text: (words, style) => this.add.text(0, 0, words, style),
    };

    this.unsubscribeState = socketManager.onGameStateUpdate((state) => this.renderState(state));
    this.listen();
    // the chat window is the UI scene's, built as the field is reported (FS-TQZ5J § Change: Batch 6, R125)
    // T and the party panel are the UI scene's (FS-TQZ5J § Change: Phase 2: the party, R36)
    // party invites are the UI scene's: never hidden in a field, stacked clear of its chat window
    // (FS-NCC9J R24; FS-TQZ5J § Change: Phase 2: the party, R38; § Change: Batch 6, R132)
    // the HUD back to its anchors whenever the logical view changes (FS-ZAJMH R12, R13)
    relayoutOn(this, () => this.relayoutHud());

    // a stop, or the game's destroy mid-field (the page unmounts), which skips SHUTDOWN
    onSceneEnd(this, (end) => this.release(end));
  }

  /**
   * What the field reports with its name (FS-TQZ5J R9, R11): its windows as they are when read, no
   * dialogue, and its answers to the UI scene's requests. The corner row's presses come as these
   * (R14): Menu the menu's path, Inventory and Character I's and C's, Party T's, each under its own
   * refusals.
   */
  private worldSide(): WorldSide {
    return {
      windows: () => this.windows(),
      blockers: () => ({ dialogue: false }),
      // its invites stack above the UI scene's chat window (FS-NCC9J R24; FS-TQZ5J § Change: Batch 6, R132)
      invitesAboveChat: true,
      // a field is never queued (FS-X2F2H R20): Change character, dimmed while it is asked
      facts: () => ({ ...NO_FACTS, leaving: this.leavingHub }),
      // a gear panel opening ends a Shadow Shot hold (FS-JTNPR req 15; FS-TQZ5J § Change: Phase 3, R53);
      // the menu opens over no window, the gear overlay and the party panel the UI scene's (FS-3EBCA R17)
      heardUi: (ui, was) => {
        if (gearOpened(ui, was)) this.fight?.cancelAim();
      },
      answer: answering({
        changeCharacter: () => this.changeCharacter(),
        // the gear overlay's wear and take off, sent as the run sends them (§ Change: Phase 3, R54)
        equip: (item) => socketManager.sendMessage(ActionType.Equip, { item_entity_id: item }),
        unequip: (item) => socketManager.sendMessage(ActionType.Unequip, { item_entity_id: item }),
        // a take from the satchel: sent by the piles, and held in the bag while pending
        take: (item) => {
          if (this.piles?.loot(item)) this.ui.gear({ kind: "taken", item });
        },
      }),
    };
  }

  /** Whether the UI scene's menu slot is filled (FS-TQZ5J R10): every guard that read the field's own menu reads this. */
  private get menuOpen(): boolean {
    return this.ui.ui.menuOpen;
  }

  /**
   * Which of the field's windows are open now, as its report to the UI bridge reads them (FS-TQZ5J R9;
   * FS-WDM0X S8): a field has no letter panel; Inventory and Character are the UI scene's (§ Change:
   * Phase 3, R55).
   */
  private windows(): WorldWindows {
    return { letter: false };
  }

  /**
   * The logical view changed (FS-ZAJMH R13): what keeps to the right or the centre goes back to
   * its anchor, open panels included. The bars, the chat window and the party frames
   * keep to the left and the bottom, which a width change does not move; the gear overlay follows
   * Phaser's resize itself.
   */
  private relayoutHud(): void {
    this.arrivalCard.relayout();
    this.minimap?.place();
    if (this.fallenView) {
      this.showFallen();
      this.drainFallen(this.time.now);
    }
  }

  /** The field's answer to leaving: a refusal keeps the player here and says why. */
  private listen(): void {
    // leaving for the roster from the menu (FS-G4VMQ § Change C3): the scene switches on the
    // server's world_left; a refusal keeps the player here and says why in passing
    socketManager.on("world_left", () => {
      if (!this.leavingHub) return;
      this.leavingHub = false;
      this.scene.start("MainMenuScene");
    });
    socketManager.onError(ActionType.LeaveHub, (info) => {
      if (!this.leavingHub) return;
      this.leavingHub = false;
      // Change character comes back on the menu (FS-TQZ5J R9)
      this.ui.changed();
      this.notice(info.message ?? "The field will not let you go yet. Ask again.");
    });
    socketManager.onError(ActionType.LeaveField, (info) => {
      if (!this.leavingField) return;
      this.leavingField = false;
      this.notice(fieldRefusalCopy(ActionType.LeaveField, info.reason));
    });
    // a refused pickup: a pile still held for its killer says so (§Requirements 33, 60)
    socketManager.on(ActionType.Interact, (reply: { success?: boolean; reason?: string } | undefined) => {
      if (reply?.success === false) this.piles?.refused(reply.reason);
    });
  }

  /**
   * The field's drop piles (§Requirements 56, 59): the run's heap texture and the run's satchel,
   * composed, never copied. A Forest clearing chest is the run's chest, opened through the same
   * satchel (FS-3QHQZ §Requirements 19), and so is a clearing sack, drawn as itself (FS-1D6BX
   * §Requirements 13). E reaches for the nearest pile, chest or sack, F takes its first item, a
   * click on the open satchel takes that one.
   */
  private createPiles(): void {
    if (!this.textures.exists(DROP_PILE.texture)) {
      const g = this.make.graphics({});
      paintDropPile(g);
      g.generateTexture(DROP_PILE.texture, DROP_PILE.width, DROP_PILE.height);
      g.destroy();
    }
    // the run's chest placeholders, should the baked chest sheet be missing (FS-3QHQZ §Requirements 19)
    for (const frame of ["closed", "open"] as const) {
      if (this.textures.exists(CHEST.placeholder[frame])) continue;
      const g = this.make.graphics({});
      paintChest(g, frame);
      g.generateTexture(CHEST.placeholder[frame], CHEST.width, CHEST.height);
      g.destroy();
    }
    // and the run's sack placeholders, until the baked sack sheet lands (FS-1D6BX §Requirements 17)
    for (const frame of ["closed", "open"] as const) {
      if (this.textures.exists(SACK.placeholder[frame])) continue;
      const g = this.make.graphics({});
      paintSack(g, frame);
      g.generateTexture(SACK.placeholder[frame], SACK.width, SACK.height);
      g.destroy();
    }
    // the run's satchel, the UI scene's: its take pre-checked by its gear's bag, sent here as `take`
    // (FS-TQZ5J § Change: Phase 3, R52–R54)
    const satchel = worldContainer(() => this.ui);
    this.piles = new FieldPiles(
      {
        place: (at) => {
          const sprite = this.add.sprite(0, 0, DROP_PILE.texture).setOrigin(DROP_PILE.origin.x, DROP_PILE.origin.y);
          standAt(sprite, at);
          return sprite;
        },
        // a clearing chest, its frame shown as the run shows a coffer's, from is_open each state
        placeChest: (at) => {
          const sprite = this.add.sprite(0, 0, CHEST.placeholder.closed);
          return {
            show: (isOpen) => {
              const frame = chestFrame(isOpen);
              showState(sprite, this.art, CHEST.sheet, frame, CHEST.placeholder[frame]);
              standAt(sprite, at);
            },
            destroy: () => sprite.destroy(),
          };
        },
        // a clearing sack, drawn as the run draws one: a chest in all but its look (FS-1D6BX R13)
        placeSack: (at) => {
          const sprite = this.add.sprite(0, 0, SACK.placeholder.closed);
          return {
            show: (isOpen) => {
              const frame = sackFrame(isOpen);
              showState(sprite, this.art, SACK.sheet, frame, SACK.placeholder[frame]);
              standAt(sprite, at);
            },
            destroy: () => sprite.destroy(),
          };
        },
      },
      satchel,
      {
        notice: (text) => this.notice(text),
        send: (action, payload) => socketManager.sendMessage(action, payload),
      },
    );
  }

  /**
   * Out of the field for the roster (FS-G4VMQ § Change C3, R25): one leave_hub, which the server
   * takes from a field (FS-X2F2H R18), and nothing more until it is answered.
   */
  private changeCharacter(): void {
    if (this.leavingHub) return;
    this.leavingHub = true;
    socketManager.sendMessage(ActionType.LeaveHub, {});
  }

  /**
   * The field's E: reaching for a pile or chest, unless the UI scene's open inventory holds it (its
   * E equips or unequips there). I, B, C, Q and F are the UI scene's, with the overlay and the satchel
   * (FS-TQZ5J § Change: Phase 3, R56), as Esc and the ESC menu's keys are (R17, R18): the field binds
   * none of them.
   */
  private bindHudKeys(): void {
    this.input.keyboard?.on("keydown-E", () => {
      if (this.menuOpen || this.ui.ui.inventory) return;
      if (this.selfAt && !this.fallen.isDown()) this.piles?.interact(this.selfAt);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // the map is laid out in logical units; Phaser's pointer.x/y are backing px (FS-ZAJMH R15)
      const at = viewport.toLogical(pointer);
      // the map mode icon lit under the pointer, unless a panel or a UI piece lies over it (FS-56CKV
      // §Change: Map mode icon, D7; FS-TQZ5J § Change: Phase 2: the party, R41)
      if (this.ui.overUi) this.minimap?.pointerOut();
      else this.minimap?.pointerMove(at.x, at.y);
    });
    this.input.on("gameout", () => this.minimap?.pointerOut());
  }

  /**
   * A press on the map mode icon is M's: never an attack, a cast or a Shadow Shot hold. A press on the chat
   * window, over the overlay's panels or on the open satchel is the UI scene's and never reaches the field
   * (FS-TQZ5J § Change: Phase 3, R59; § Change: Batch 6, R129); one in the overlay's clear middle band
   * attacks as with it closed (FS-HRH2J R8).
   */
  private takesPointer(x: number, y: number, primary: boolean): boolean {
    // the open menu's rows take their own presses; nothing in the world answers one (FS-G4VMQ R5),
    // nor the map mode icon, whose guards the menu is one of
    if (this.menuOpen) return true;
    // a press on the map mode icon is M's, never an attack or a cast (FS-56CKV §Change: Map mode icon, D6)
    return this.minimap?.pointerDown(x, y, primary) ?? false;
  }

  /**
   * Everything one visit made is let go: Phaser reuses the scene instance for the next. On the
   * game's destroy the scene's plugins are already gone and are asked nothing (`SceneEnd`).
   */
  private release(end: SceneEnd): void {
    this.unsubscribeState?.();
    socketManager.offError(ActionType.LeaveField);
    socketManager.off(ActionType.Interact);
    socketManager.off("world_left");
    socketManager.offError(ActionType.LeaveHub);
    this.leavingHub = false;
    this.piles?.release();
    this.piles = undefined;
    // what was charted since the last write, kept as the scene ends (FS-P0HSP §D.25)
    this.charting?.saveLast();
    this.minimap?.destroy();
    this.minimap = undefined;
    this.minimapStage = undefined;
    this.modeIconStage = undefined;
    this.charting = undefined;
    this.mapField = { walls: [], gates: [] };
    this.lastState = undefined;
    this.selfAt = undefined;
    this.views.clear();
    this.selfEntityID = null;
    this.followedSprite = undefined;
    this.groundDrawn = false;
    this.obstaclesDrawn = false;
    this.entranceDrawn = false;
    this.occluders.clear();
    this.atEntrance = undefined;
    this.leavingField = false;
    this.fallen.reset();
    this.hideFallen();
    this.fight?.release();
    this.fight = undefined;
    this.lightMap = undefined;
    // a destroyed game took its input manager, the cursor and the captures with it
    if (end === "shutdown") this.handBackInput();
  }

  /** What the visit left on the game's input, which Phaser keeps across stops (`SceneEnd`). */
  private handBackInput(): void {
    // the fight's strike-mark is the field's; the hand stays, for the menus wear it too
    // (FS-KYPQ9 § Change: The pressed hand, and the hand on the menus, P7)
    findPointerLook(this)?.base("hand");
    releaseCaptures(this.input.keyboard, [
      ...Object.values(this.cursors ?? {}),
      ...Object.values(this.wasd ?? {}),
    ]);
  }

  update(time: number, delta: number): void {
    this.sendMovementIntent();
    this.drawFieldMap();
    // the charted ground kept in this browser, as often as its keeper says (FS-P0HSP §D.25)
    this.charting?.save(this.time.now);
    this.fight?.update(delta);
    this.drainFallen(this.time.now);
    for (const view of this.views.values()) {
      view.pos.x = Phaser.Math.Linear(view.pos.x, view.target.x, POSITION_LERP);
      view.pos.y = Phaser.Math.Linear(view.pos.y, view.target.y, POSITION_LERP);
      standAt(view.sprite, view.pos, 1);
      const body = view.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
      if (view.anim.baked && body) view.anim.show(body, view.anim.step(view.pos, time, delta, view.fallen));
      const s = worldToScreen(view.pos.x, view.pos.y);
      view.name.setPosition(s.x, s.y - (body?.displayHeight ?? 60) - NAME_GAP);
    }
    // the light-map in daylight; the torch rides with the player as in every world
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    this.lightMap?.carry(self ? { x: self.sprite.x, y: self.sprite.y } : null);
    this.lightMap?.update(time);
    this.followMapOverlay();
    const selfBody = self?.sprite.getByName("body") as Phaser.GameObjects.Sprite | null | undefined;
    this.occluders.update(
      self && selfBody ? { bounds: selfBody.getBounds(), depth: self.sprite.depth } : null,
      delta,
    );
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  /** Velocity, sent only when it changes, and always on a visit's first frame ({@link lastSent}). */
  private sendMovementIntent(): void {
    if (!this.cursors || !this.wasd) return;
    // the fallen do not walk; the server would refuse it
    if (this.fallen.isDown()) return;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    // the keys read released while an archer draws a Shadow Shot (FS-JTNPR req 9), and while the
    // ESC menu owns them (FS-G4VMQ R5): a stride it interrupts stops
    const aiming = this.fight?.aiming === true || this.menuOpen;
    const vx = aiming ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
    const vy = aiming ? 0 : (down ? 1 : 0) - (up ? 1 : 0);
    if (vx === this.lastSent?.vx && vy === this.lastSent?.vy) return;
    this.lastSent = { vx, vy };
    socketManager.sendMessage(ActionType.Move, { vx, vy });
  }

  private renderState(state: ClientGameState): void {
    // a field never draws another world's state (FS-X2F2H §Requirements 55)
    if (state.world_type !== "field") return;

    const present = new Set<string>();
    if (state.current_player) {
      this.placePlayer(state.current_player, true);
      present.add(state.current_player.entity_id);
      this.selfEntityID = state.current_player.entity_id;
      const self = this.views.get(this.selfEntityID);
      if (self) this.keepCameraOn(self.sprite);
      this.followEntrance(state.current_player.position, state.gates ?? []);
      this.followFall(state.current_player);
    }

    this.drawGround(state.gates ?? [], state.walls ?? []);
    this.drawObstacles(state);
    this.drawEntrance(state.gates ?? []);

    for (const other of state.other_players ?? []) {
      this.placePlayer(other, false);
      present.add(other.entity_id);
    }

    for (const [entityID, view] of this.views) {
      if (present.has(entityID)) continue;
      view.sprite.destroy();
      view.name.destroy();
      this.views.delete(entityID);
    }

    // the field's monsters, projectiles and struck players, once the bodies stand
    this.fight?.sync(state);

    // the field's piles, each as faint as its reservation for me says (§Requirements 59)
    const me = state.current_player;
    this.selfAt = me ? { x: me.position.x, y: me.position.y } : undefined;
    // the overlay's bag, slots and stats panel, from this state (FS-HRH2J R24, R30): the UI scene's
    // (FS-TQZ5J § Change: Phase 3, R52)
    if (me) this.ui.gear({ kind: "seen", carried: me, character: me });
    this.ui.gear({ kind: "level", level: me?.level });
    this.piles?.sync(state.containers ?? [], me?.id);
    if (this.selfAt) this.piles?.follow(this.selfAt);

    this.lastState = state;
    this.showClassHud(state);
    // the party frames are the UI scene's: this state's players, as plain data (FS-R82NV R34, R35;
    // FS-TQZ5J § Change: Phase 2: the party, R38)
    this.ui.partySeen(state);
    this.showFieldMap(state);
    // the field is drawn: an arrival's dark lifts off it (FS-PQ2TW R12)
    this.arrivalCard.built();
  }

  /**
   * The field's minimap from this state (FS-P0HSP §B, §D, §E): built with the field's first state;
   * the ground round the local player charted, alive or fallen, never round a party member's; the
   * map drawn at once the first time and after at most every `FIELD_CHART.redraw` while new
   * ground is charted ({@link drawFieldMap}); the party's dots on every state.
   */
  private showFieldMap(state: ClientGameState): void {
    if (!this.minimap) {
      if (!this.minimapStage) return;
      this.minimap = new WorldMinimapController({
        stage: this.minimapStage,
        world: this.size,
        store: this.minimapStore,
        renderScale: () => viewport.renderScale,
        // a press on its map mode icon is M's, under M's guards in a field (FS-56CKV §Change: Map mode icon, D6)
        icon: this.modeIconStage && { stage: this.modeIconStage, blocked: () => this.minimapKeysOwned() },
        // the field's name on it, as its arrival card titles it (FS-56CKV §Change: Map name, E1)
        name: minimapPlaceName({ world: "field", field: this.field }),
        // only M and the icon step it, both the player's (FS-WDM0X S7)
        stepped: () => this.ui.play("map_mode_switch"),
      });
      // this character's ground in this field, as this browser kept it (FS-P0HSP §D.25)
      const owner = useGameStore.getState().activeCharacterId;
      this.charting = new FieldChartKeeper(this.chartStore, owner, this.field, this.size, this.time.now);
    }
    const me = state.current_player;
    if (me) this.charting?.chart.chartAround(me.position);
    this.mapField = { walls: state.walls ?? this.mapField.walls, gates: state.gates ?? this.mapField.gates };
    this.drawFieldMap();
    this.charting?.save(this.time.now);
    this.minimap.party(state, usePartyStore.getState().party?.members.map((m) => m.player_id) ?? []);
  }

  /**
   * The field's map drawn again where what it shows changed (FS-P0HSP §D.28): newly charted ground
   * or the field's walls, as often as the chart's keeper says is due. Each frame and each state;
   * it builds nothing while nothing is new.
   */
  private drawFieldMap(): void {
    const map = this.minimap;
    const kept = this.charting;
    if (!map || !kept || !kept.redrawDue(this.mapField.walls.length, this.time.now)) return;
    map.show(fieldMap(kept.chart, this.mapField, this.size));
  }

  /**
   * M (FS-P0HSP §F.31, §F.33): the run's three modes on the field's minimap, kept in this browser
   * on the run's one key. Not while chat is typing, nor while the ESC menu is up, which owns the
   * keys as the town's does (FS-G4VMQ § Change C4); the rest of M's guards are the minimap's own.
   */
  private bindMinimapKey(): void {
    bindMinimapKey(this.input.keyboard ?? undefined, () => this.minimapKeysOwned(), () => this.minimap);
  }

  /** M's guards in a field, the key's and the map mode icon's (FS-P0HSP §F.33): chat typing, or the ESC menu owning the keys. */
  private minimapKeysOwned(): boolean {
    // the player typing in the UI scene's chat (FS-TQZ5J § Change: Batch 6, R127)
    return !!this.ui.ui.typing || this.menuOpen;
  }

  /** The map overlay on the player (FS-P0HSP §F.31): each frame, after the figures have eased. */
  private followMapOverlay(): void {
    this.minimap?.follow(this.selfView()?.pos, (id) => this.views.get(id)?.pos);
  }

  /**
   * The run's Health and class resource bars and its ability card (FS-8AY7S req 20–32), by the
   * same rules: up while the player stands in the field, down while they lie fallen. A field has
   * no leave button to share the card's corner.
   */
  private showClassHud(state: ClientGameState): void {
    // the UI scene's, in the field's corner (FS-TQZ5J § Change: Batch 5, R68, R69)
    this.ui.hud({ world: "field", kind: "bars", bars: hudBars(state) });
    this.showAbilityCard();
  }

  /**
   * The ability card, redrawn on every state and as the lockout starts and ends (req 31): handed to the
   * UI scene, which draws it above the corner row (FS-3EBCA R13; FS-TQZ5J § Change: Batch 5, R68).
   */
  private showAbilityCard(): void {
    const state = this.lastState;
    if (!state) return;
    this.ui.hud({ world: "field", kind: "ability", card: abilityCard(state, { lockedOut: this.fight?.lockedOut ?? false, leaveUp: false }) });
  }

  /** This client's player as drawn, once the field has reported them. */
  private selfView(): PlayerView | undefined {
    return this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
  }

  /**
   * The entrance gate's trigger, on each state with the player's server-reported position and the
   * server's gates: stepping into the road home sends one leave_field (§Requirements 57).
   */
  private followEntrance(pos: Position, gates: readonly GateState[]): void {
    const roads = gates.filter((gate) => gate.destination === "hub");
    const { entered } = gateEdges(this.atEntrance, gateAt(pos, roads));
    this.atEntrance = gateAt(pos, roads);
    if (entered) this.leave();
  }

  /**
   * The player's own fall (§Requirements 58): on the state that reports it, the fallen state goes
   * up, counted down each frame; on the state that has them standing again, at the entrance, it
   * comes down and a key still held walks them on.
   */
  private followFall(me: PlayerState): void {
    const change = this.fallen.observe(isFallen(me), this.time.now);
    if (change === "fell") {
      this.showFallen();
      this.drainFallen(this.time.now);
    } else if (change === "rose") {
      this.hideFallen();
      // the server stopped them as they fell: a key still held is sent again
      this.lastSent = { vx: 0, vy: 0 };
    }
  }

  /**
   * The fallen state as the shared countdown (FS-B3NDZ R12): a charcoal panel centred on the
   * canvas, the line, the whole seconds under it, and the bar along its foot.
   */
  private showFallen(): void {
    this.hideFallen();
    const f = fallenFrame(viewport.width, viewport.height);
    const panel = this.add.graphics().setScrollFactor(0).setDepth(FALLEN_DEPTH);
    panel.fillStyle(BARROW_HEX.charcoal, 1);
    panel.fillRect(f.panel.x, f.panel.y, f.panel.width, f.panel.height);
    const text = (r: Rect, content: string, px: number, colour: number) =>
      this.add
        .text(r.x + r.width / 2, r.y + r.height / 2, content, {
          fontFamily: CANVAS_FONT.body,
          fontSize: `${px}px`,
          color: toCss(colour),
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(FALLEN_DEPTH);
    this.fallenView = {
      panel,
      bar: this.add.graphics().setScrollFactor(0).setDepth(FALLEN_DEPTH),
      barRect: f.bar,
      line: text(f.line, FALLEN_LINE, FALLEN_LINE_PX, BARROW_HEX.vellum),
      seconds: text(f.seconds, "", COUNTDOWN_SECONDS_PX, palette.hudText),
    };
  }

  /** Once a frame while down: the number counts 3-2-1 and the bar drains from the right. */
  private drainFallen(now: number): void {
    const view = this.fallenView;
    const count = this.fallen.count(now);
    const fraction = this.fallen.fraction(now);
    if (!view || count === undefined || fraction === undefined) return;
    view.seconds.setText(countdownSecondsText(count));
    view.bar.clear();
    drawCountdownBar(view.bar, view.barRect, fraction);
  }

  private hideFallen(): void {
    const view = this.fallenView;
    if (!view) return;
    view.panel.destroy();
    view.bar.destroy();
    view.line.destroy();
    view.seconds.destroy();
    this.fallenView = undefined;
  }

  /** Home through the road: one leave_field, and nothing more until it is answered. */
  private leave(): void {
    if (this.leavingField) return;
    this.leavingField = true;
    socketManager.sendMessage(ActionType.LeaveField, {});
  }

  private keepCameraOn(sprite: Phaser.GameObjects.Container): void {
    if (sprite === this.followedSprite) return;
    followWith(this.cameras.main, sprite);
    this.followedSprite = sprite;
  }

  /**
   * The field's ground in its look (§Requirements 54), with the road home running from inside the
   * entrance gate to the map's edge, all of it fading into the edge tint there (FS-KSD6K
   * §Requirements 16): laid once, with the first state, which carries the gate. A forest waits for
   * its walls, its stands' leaf litter laid under them (FS-3QHQZ §Requirements 25). Without the
   * ground's art, a placeholder meadow floor.
   */
  private drawGround(gates: readonly GateState[], walls: readonly WallState[]): void {
    if (this.groundDrawn || (this.look.stands && walls.length === 0)) return;
    this.groundDrawn = true;
    const { width, height } = this.size;
    const look = this.look.ground;
    if (GroundLayer.available(this.art, "field", look)) {
      // the map's ground, road and all, fades out at its own edge into the edge tint; nothing,
      // not even the road, runs on past it (FS-KSD6K §Requirements 16)
      const road = roadHomeGate(gates);
      const paths = road ? planRoadHome(road.position, this.size).paths : [];
      new GroundLayer(this, this.art, {
        width,
        height,
        kind: "field",
        look,
        paths,
        litter: this.look.stands ? walls.map(rectOfWall) : [],
        fadeEdge: true,
      });
      return;
    }
    const plane = addWorldPlane(this);
    plane.root.setDepth(0);
    const ground = this.add.graphics();
    ground.fillStyle(BARROW_HEX.arcaneDeep, 1);
    ground.fillRect(0, 0, width, height);
    ground.lineStyle(4, BARROW_HEX.brass, 0.4);
    ground.strokeRect(0, 0, width, height);
    plane.surface.add(ground);
  }

  /**
   * The field's keep-out areas, server entities like the hub's walls, drawn in the field's look on
   * the server's own rects (§Requirements 52, 54): open country stands a tree cluster or a rock on
   * each; a forest fills each with a tree stand, its trees occluders, and strews its verges
   * (FS-3QHQZ §Requirements 23, 28). Decoration only: never interactive, never a collider. Without
   * the art, placeholder blocks.
   */
  private drawObstacles(state: ClientGameState): void {
    const walls = state.walls ?? [];
    if (this.obstaclesDrawn || walls.length === 0) return;
    this.obstaclesDrawn = true;
    const keepOuts = walls.map(rectOfWall);
    const seed = worldSeed("field");
    const has = (sheet: string) => this.art.has(sheet);
    const pieces = this.look.stands
      ? planTreeStands(keepOuts, this.size, this.look.stands, seed).map((tree) => ({
          ...tree,
          // before the forest's own trees are baked, the oak and pine stand in for them
          sheet: standSheet(tree.sheet, has),
          tall: true,
        }))
      : planKeepOutDressing(keepOuts, this.look.dressing, seed);
    const baked = pieces.filter((piece) => has(piece.sheet));
    for (const piece of baked) {
      const { sprite } = addProp(this, this.art, piece.sheet, piece.at, { index: piece.index });
      if (piece.tall) this.occluders.add([sprite]);
    }
    if (this.look.verges) {
      const statics = forestStatics(state, this.size.width, this.size.height);
      addDressing(this, this.art, planVerges(this.look.verges, seed, statics));
    }
    if (baked.length > 0) return;

    const plane = addWorldPlane(this);
    plane.root.setDepth(1);
    const shapes = this.add.graphics();
    shapes.fillStyle(BARROW_HEX.barrowDeep, 0.9);
    for (const wall of walls) shapes.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);
    plane.surface.add(shapes);
  }

  /**
   * The road home (§Requirements 54): the road is laid with the ground; here its signpost beside
   * the gate, and its name over the signpost, amber for a place to walk into: a marker, above the
   * light-map. Without a baked signpost, the gate's reach is ringed on the ground instead.
   */
  private drawEntrance(gates: readonly GateState[]): void {
    const road = roadHomeGate(gates);
    if (this.entranceDrawn || !road) return;
    this.entranceDrawn = true;

    let at = worldToScreen(road.position.x, road.position.y);
    let rise = 40;
    const post = this.art.sheet(SIGNPOST);
    if (post) {
      const { signpost } = planRoadHome(road.position, this.size);
      const { sprite } = addProp(this, this.art, SIGNPOST, signpost);
      this.occluders.add([sprite]);
      at = worldToScreen(signpost.x, signpost.y);
      rise = post.frameHeight * post.anchor.y + NAME_GAP;
    } else {
      const plane = addWorldPlane(this);
      plane.root.setDepth(1);
      const reach = this.add.graphics();
      reach.lineStyle(3, BARROW_HEX.amber, 0.6);
      reach.strokeCircle(road.position.x, road.position.y, road.range);
      plane.surface.add(reach);
    }

    this.add
      .text(at.x, at.y - rise, ROAD_HOME, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.markerGate),
        ...FIELD_MARKER_STROKE,
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);
  }

  private placePlayer(player: PublicPlayerState, isSelf: boolean): void {
    const existing = this.views.get(player.entity_id);
    const fallen = isFallen(player);
    if (existing) {
      existing.target = { x: player.position.x, y: player.position.y };
      // risen at the entrance: stand there at once rather than slide across the field
      if (existing.fallen && !fallen) existing.pos = { ...existing.target };
      existing.fallen = fallen;
      const { vx, vy } = player.direction ?? { vx: 0, vy: 0 };
      existing.facing = facingFrom(vx, vy, existing.facing);
      if (!existing.anim.baked) {
        const body = existing.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
        body?.setTexture(placeholderTexture(player.class, nearestScreenFacing(existing.facing)));
      }
      return;
    }

    const body = this.add.sprite(0, 0, placeholderTexture(player.class, "down"));
    body.setName("body");
    const anim = new CharacterAnimator(this.art, player.class);
    if (anim.baked) anim.dress(body);
    else if (!isSelf) body.setTint(BARROW_HEX.vellumDark);

    const name = this.add
      .text(0, 0, player.username, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.markerHub),
        ...FIELD_MARKER_STROKE,
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);

    const pos = { x: player.position.x, y: player.position.y };
    const sprite = this.add.container(0, 0, [body]);
    standAt(sprite, pos, 1);
    this.views.set(player.entity_id, { sprite, name, pos, target: { ...pos }, facing: "se", anim, fallen });
  }

  /**
   * A line said in passing, in the neutral HUD register. The UI scene draws it, over the interface,
   * and takes it down as the field leaves (FS-TQZ5J A2 R33, R34).
   */
  private notice(text: string): void {
    this.ui.notice({ text, look: { world: "field" } });
  }
}
