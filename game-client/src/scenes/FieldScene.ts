import * as Phaser from "phaser";
import { ActionType, WorldType, type FieldId } from "@/assets/types/client";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import type { ClientGameState, GateState, ItemState, PlayerState, Position, PublicPlayerState, WallState } from "@/types/gameState";
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
import { ContainerView } from "@/ui/ContainerView";
import { GearOverlay } from "@/ui/GearOverlay";
import { EquipmentHud } from "@/ui/EquipmentHud";
import { PurseReader } from "@/ui/purse";
import { apiClient } from "@/utils/api";
import { RESOURCE_HUD_AT, ResourceHud } from "@/ui/ResourceHud";
import { ChatWindow, mountChatWindow } from "@/ui/ChatWindow";
import { PartyPanel, mountPartyPanel } from "@/ui/PartyPanel";
import { escapeStep } from "@/ui/escapeOrder";
import { HudCorner } from "@/ui/HudCorner";
import { ABILITY_CARD_PLACE } from "@/ui/hudCornerLayout";
import { showMenuPanel, type MenuTones } from "@/ui/menuPanel";
import { openOptionsPanel, type MenuSlotKeys } from "@/ui/optionsPanel";
import { browserMusicStore, storedMusicLevel } from "@/audio/musicSetting";
import { UiSounds, sceneUiSoundStage, type WindowState } from "@/audio/uiSounds";
import { browserSfxStore } from "@/audio/sfxSetting";
import { hubMenuChoices, type HubMenuChoice } from "./hubMenu";
import { PartyFrames, mountPartyFrames } from "@/ui/PartyFrames";
import { PartyInvitePrompt, mountPartyInvitePrompt } from "@/ui/PartyInvitePrompt";
import { AbilityHud } from "@/ui/AbilityHud";
import { abilityCard } from "@/ui/abilityCard";
import { hudBars } from "@/ui/resources";
import { createAtmosphere } from "@/utils/atmosphere";
import { fieldCombatOnScene, type FieldCombat } from "./fieldCombat";
import { FieldPiles } from "./fieldPiles";
import { onSceneEnd, releaseCaptures, type SceneEnd } from "./sceneEnd";
import {
  COUNTDOWN_SECONDS_PX,
  countdownSecondsText,
  drawCountdownBar,
} from "@/ui/countdownBar";
import type { Rect } from "@/ui/partyPanelLayout";
import { FALLEN_LINE, FallenCountdown, fallenFrame, isFallen } from "./fieldFallen";
import { fieldRefusalCopy } from "./fieldRefusals";
import { gateAt, gateEdges } from "./hubGates";
import { afterFrameSetUp, boundCamera, followWith, fullscreenButtonPlace, relayoutOn, viewport, type FullscreenButtonPlace } from "@/render/viewport";
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

/**
 * A field world (FS-X2F2H §H): the ground, the player and the others in this pod's channel, the
 * field's keep-out areas and its entrance gate, the road home. Each field is drawn in its own look
 * (`fieldLook`, keyed by the field id from world_entered): its daylit ground, its ambient, trees
 * and rocks on the server's keep-outs, and past the map's edge only its flat edge tint, the ground
 * fading into it (FS-KSD6K §Requirements 14, 16). Monsters
 * and the fight with them are the run scene's own pieces, composed in `fieldCombat`; drop piles
 * and the satchel they are taken through, in `fieldPiles`, a pile held for someone else's kill
 * drawn faint and not offered (§Requirements 56, 59). The equip HUD is the run's own
 * (`EquipmentHud` on the gear and bag overlay, FS-HRH2J), on the run's keys: I or B opens it,
 * E over it equips, and a full bag refuses pickups and unequips with the field's notice.
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
const NOTICE_Y = 72;
const NOTICE_MS = 3200;
/** The fallen state's depth, as it has always stood: the HUD's. */
const FALLEN_DEPTH = 1000;
/** The fallen line's size, as it has always been. */
const FALLEN_LINE_PX = 18;
/** The ESC menu's pressable rows and tokens: the town's (FS-G4VMQ § Change C2). */
const MENU_CHOICE_HIT = { width: 160, height: 34 };
const MENU_TONES: MenuTones = {
  panel: BARROW_HEX.charcoal,
  frame: BARROW_HEX.brass,
  text: BARROW_HEX.vellum,
  dim: BARROW_HEX.vellumDark,
  actionable: BARROW_HEX.amber,
  cancel: BARROW_HEX.arcane,
};

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
  /**
   * The ESC menu while it is open (FS-G4VMQ § Change: The ESC menu in a field world): the town's,
   * Change character, Options and Back; or the OPTIONS panel opened from it in its place (FS-28DDG
   * § Change: Music volume in an Options panel, C8). It owns the keys and presses while up.
   */
  private menu?: Phaser.GameObjects.Container;
  private menuChoices?: MenuSlotKeys;
  private moveMenu?: (origin: { x: number; y: number }) => void;
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
  /** The field's drop piles and the run's satchel they are taken through (§Requirements 56, 59). */
  private piles?: FieldPiles;
  private satchel?: ContainerView;
  /** The run's equip HUD, what the player carries and wears (§Requirements 56). */
  private equipment?: EquipmentHud;
  /** The Health and class resource bars, and the ability card: the run's own (FS-8AY7S req 20, 29). */
  private resourceHud?: ResourceHud;
  /** The chat window (FS-WJGFJ §C): built with the scene, taken down with it. */
  private chatWindow?: ChatWindow;
  private partyPanel?: PartyPanel;
  /** The teammates' frames at the top-left corner (FS-R82NV R34). */
  private partyFrames?: PartyFrames;
  /** Invites waiting on an answer, top centre: an invite reaches a field too (FS-NCC9J R24). */
  private invitePrompt?: PartyInvitePrompt;
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
  /** Where the fullscreen button is stood, beside the minimap or in its corner (FS-56CKV §Change: Minimap at the top, fullscreen button beside it). */
  private readonly fullscreenButton: FullscreenButtonPlace = fullscreenButtonPlace;
  private abilityHud?: AbilityHud;
  /** The corner row (FS-3EBCA): Menu, Inventory, Character, Party and the Mailbox greyed; the card above it. */
  private corner?: HudCorner;
  /** The interface sounds' player and wrapper (FS-WDM0X S23), made in create before anything that hears a player. */
  private sounds?: UiSounds;
  /** The latest field state, for the ability card's redraw as the lockout starts and ends. */
  private lastState?: ClientGameState;
  /** The player's server-reported position and level, for reaching a pile and the satchel's marks. */
  private selfAt?: Point;
  private selfLevel?: number;
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
    this.mountUiSounds();
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
      lockout: () => this.showAbilityCard(),
    });
    this.createPiles();
    this.equipment = this.composeEquipment();
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
    this.chatWindow = mountChatWindow(this, () => this.mayChat());
    // T: the party panel, opening over the inventory and the character panel (FS-R82NV R28, § Change C8)
    this.partyPanel = mountPartyPanel(this, () => this.refusesParty(), undefined, this.sounds);
    // party invites, never hidden in a field, stacked clear of the chat window (FS-NCC9J R24)
    this.invitePrompt = mountPartyInvitePrompt(this, () => false, () => this.chatWindow?.topEdge());
    // the teammates' frames: bars for those this field's state shows, a word for the rest (FS-R82NV R34)
    this.partyFrames = mountPartyFrames(this, this.art);
    this.mountCorner();
    // the HUD back to its anchors whenever the logical view changes (FS-ZAJMH R12, R13)
    relayoutOn(this, () => this.relayoutHud());

    // a stop, or the game's destroy mid-field (the page unmounts), which skips SHUTDOWN
    onSceneEnd(this, (end) => this.release(end));
  }

  /**
   * The interface sounds (FS-WDM0X S23): the player on the game's sound, the level this browser
   * kept, and the field's windows as the rule reads them. Each player input that can open or close a
   * window runs through its wrapper (`act`), here and in the modules it is handed to (S9).
   */
  private mountUiSounds(): void {
    this.sounds = new UiSounds(sceneUiSoundStage(this), browserSfxStore, () => this.windowState());
  }

  /** Which of the field's windows are open now (FS-WDM0X S8): the menu's slot, Party, Inventory, Character; a field has no letter panel. */
  private windowState(): WindowState {
    return {
      menu: !!this.menu,
      letter: false,
      party: this.partyPanel?.isOpen() ?? false,
      inventory: this.equipment?.isInventoryOpen() ?? false,
      character: this.equipment?.isCharacterOpen() ?? false,
    };
  }

  /**
   * A player's action, through the interface sounds' wrapper (FS-WDM0X S9): the one effect its
   * change of window plays. Before create made the player, it runs as it is. Nothing the game does
   * on its own comes through here (S4).
   */
  private act<T>(run: () => T): T {
    return this.sounds ? this.sounds.act(run) : run();
  }

  /**
   * The corner row: the Menu icon opens the menu (R6), the others each the key's own path; the
   * Mailbox greyed, it is the town's (FS-3EBCA).
   */
  private mountCorner(): void {
    this.corner = new HudCorner(this, {
      icons: [
        { icon: "menu", press: () => this.act(() => this.pressMenuIcon()) },
        { icon: "inventory", press: () => this.act(() => this.toggleGear()) },
        { icon: "character", press: () => this.act(() => this.toggleCharacter()) },
        // the panel's toggle runs through the wrapper too, and joins this press (FS-WDM0X S9)
        { icon: "party", press: () => this.act(() => this.partyPanel?.toggle()) },
        { icon: "mail", greyed: true },
      ],
    });
  }

  /**
   * Whether T and the Party icon are refused now (FS-R82NV R28; FS-3EBCA R8): the menu owns the
   * screen. The inventory and the character panel do not: the party panel opens over them
   * (FS-R82NV § Change C8).
   */
  private refusesParty(): boolean {
    return !!this.menu;
  }

  /** Whether the chat input may take focus (FS-WJGFJ R27): not while the menu (FS-3EBCA R18) or the gear overlay is up. */
  private mayChat(): boolean {
    return !this.menu && !this.equipment?.isOpen();
  }

  /** The menu opens over no window (FS-3EBCA R17): the party panel and the overlay go. */
  private closeWindows(): void {
    this.partyPanel?.close();
    this.equipment?.hide();
  }

  /**
   * The corner row's Menu icon (FS-3EBCA R6, R17, R18): the menu at once, every window closing as
   * it opens; with the menu open it closes it, as its × and Back do (owner 2026-11-12: "menu無法再按一次icon關閉").
   */
  private pressMenuIcon(): void {
    if (this.menu) this.closeMenu();
    else this.openMenu();
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
    this.abilityHud?.relayout();
    this.corner?.relayout();
    this.moveMenu?.({ x: viewport.centerX, y: viewport.centerY });
    // the party panel stands centred, so a width change moves it (FS-R82NV § Change C5)
    this.partyPanel?.relayout();
    this.satchel?.relayout();
    this.invitePrompt?.relayout();
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
      this.menuChoices?.retone();
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
    const satchel = new ContainerView(this, this.art, {
      onLoot: (item) => this.lootFromSatchel(item),
      characterLevel: () => this.selfLevel,
      mayTake: () => this.bagHasRoom(),
    });
    this.satchel = satchel;
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
   * The run's gear and bag overlay over the live field (FS-HRH2J), its sends the run's, its
   * full-bag refusals in the field's notice (R22). A field marks no unsafe finds (FS-18Z5F R37).
   * Each open reads the purse line's gold from the wallet (FS-7TGZ3 R8).
   */
  private composeEquipment(): EquipmentHud {
    // what the party panel covers is the party panel's (FS-R82NV § Change C8)
    // its panels' × run through the interface sounds' wrapper (FS-WDM0X S9)
    const overlay = new GearOverlay(
      this,
      this.art,
      WorldType.Field,
      (x, y) => this.partyPanel?.covers(x, y) ?? false,
      this.sounds,
    );
    return new EquipmentHud(
      overlay,
      {
        send: (action, payload) => socketManager.sendMessage(action, payload),
        notice: (text) => this.notice(text),
      },
      Date.now,
      new PurseReader(apiClient, overlay),
    );
  }

  /** Whether the bag can take one more pickup from a pile or chest (FS-HRH2J R21); the notice says when not. */
  private bagHasRoom(): boolean {
    return this.equipment?.roomForOne() ?? true;
  }

  /**
   * I, B or the corner row's icon (FS-HRH2J R4; FS-3EBCA R7): the inventory, not while the ESC
   * menu owns the keys (FS-G4VMQ R5). Opening it ends a Shadow Shot hold (FS-JTNPR req 15).
   */
  private toggleGear(): void {
    if (this.menu) return;
    if (this.equipment?.toggle()) this.fight?.cancelAim();
  }

  /** C or the corner row's Character icon: the character panel, under I's rule (FS-HRH2J § Change C2, C5). */
  private toggleCharacter(): void {
    if (this.menu) return;
    if (this.equipment?.toggleCharacter()) this.fight?.cancelAim();
  }

  /**
   * One Esc press (FS-R82NV § Change C2): one press closes one thing, the party panel, drawn over
   * the gear overlay (§ Change C8), then the overlay (`escapeStep`).
   */
  private pressEscape(): void {
    const step = escapeStep({
      menu: !!this.menu,
      gear: this.equipment?.isOpen() ?? false,
      party: this.partyPanel?.isOpen() ?? false,
    });
    if (step === "gear") this.equipment?.hide();
    else if (step === "party") this.partyPanel?.close();
    // the menu's Esc is its Back, and the OPTIONS panel's reopens the menu (FS-28DDG § Change C7)
    else if (step === "close-menu") this.menuChoices?.dismiss();
    else this.openMenu();
  }

  /**
   * The town's ESC menu, in the field (FS-G4VMQ § Change C2): Change character, Options and Back,
   * by `hubMenuChoices`' rule (a field player is never queued, FS-X2F2H R20), centred in the popup
   * band. The world runs on behind it. Every window closes as it opens (FS-3EBCA R17).
   */
  private openMenu(): void {
    this.closeWindows();
    // only the rows the field offers: no queue to leave (FS-X2F2H R20)
    // every row and the × the player's, through the interface sounds' wrapper (FS-WDM0X S9)
    const actions: Partial<Record<HubMenuChoice["id"], () => void>> = {
      change: () => this.act(() => this.changeCharacter()),
      options: () => this.act(() => this.openOptions()),
      back: () => this.act(() => this.closeMenu()),
    };
    const { container, keys, moveTo } = showMenuPanel(this, {
      choices: hubMenuChoices({ queued: false }),
      actions,
      // dimmed while the server is asked, so a second press has nothing to land on
      enabled: { change: () => !this.leavingHub },
      close: () => this.act(() => this.closeMenu()),
      origin: { x: viewport.centerX, y: viewport.centerY },
      hit: MENU_CHOICE_HIT,
      tones: MENU_TONES,
      // the Menu icon answers under the open menu: it closes it (FS-3EBCA R18)
      through: (x, y) => this.corner?.covers(x, y, "menu") ?? false,
    });
    this.menu = container;
    this.menuChoices = keys;
    this.moveMenu = moveTo;
  }

  /**
   * The OPTIONS panel, in the menu's slot so every guard on the open menu holds for it (FS-28DDG
   * § Change C3, C7, C8). No music plays in a field, so its Music row only keeps the level, read
   * as the panel opens, for the next hub entry (C14). Back, Esc and its × reopen the field's menu.
   */
  private openOptions(): void {
    this.closeMenu();
    const { container, keys, moveTo } = openOptionsPanel(this, {
      origin: { x: viewport.centerX, y: viewport.centerY },
      hit: MENU_CHOICE_HIT,
      tones: MENU_TONES,
      // Back, Esc and the ×: the slot stays filled, so it plays nothing (FS-WDM0X S5)
      back: () =>
        this.act(() => {
          this.closeMenu();
          this.openMenu();
        }),
      music: storedMusicLevel(browserMusicStore),
      // the Menu icon answers under the open panel: it closes it and opens nothing (C7, FS-3EBCA R18)
      through: (x, y) => this.corner?.covers(x, y, "menu") ?? false,
    });
    this.menu = container;
    this.menuChoices = keys;
    this.moveMenu = moveTo;
  }

  private closeMenu(): void {
    this.menu?.destroy();
    this.menu = undefined;
    this.menuChoices = undefined;
    this.moveMenu = undefined;
  }

  /**
   * Out of the field for the roster (FS-G4VMQ § Change C3, R25): one leave_hub, which the server
   * takes from a field (FS-X2F2H R18), and nothing more until it is answered.
   */
  private changeCharacter(): void {
    if (this.leavingHub) return;
    this.leavingHub = true;
    this.menuChoices?.retone();
    socketManager.sendMessage(ActionType.LeaveHub, {});
  }

  /**
   * The run's keys for the satchel and the equip HUD: I or B opens and closes the overlay, Q and
   * ESC close it (FS-HRH2J R4; a field has no ESC menu); E over the open overlay equips or
   * unequips, as in the run, else reaches for a pile or chest; F takes the satchel's first item.
   */
  private bindHudKeys(): void {
    this.input.keyboard?.on("keydown-E", () => {
      if (this.menu) return;
      if (this.equipment?.equipKey()) return;
      if (this.selfAt && !this.fallen.isDown()) this.piles?.interact(this.selfAt);
    });
    // the keys that open or close a window, each through the interface sounds' wrapper (FS-WDM0X S9)
    for (const key of ["keydown-I", "keydown-B"]) this.input.keyboard?.on(key, () => this.act(() => this.toggleGear()));
    this.input.keyboard?.on("keydown-C", () => this.act(() => this.toggleCharacter()));
    this.input.keyboard?.on("keydown-Q", () =>
      this.act(() => {
        if (!this.menu) this.equipment?.hide();
      }),
    );
    this.input.keyboard?.on("keydown-ESC", () => this.act(() => this.pressEscape()));
    this.input.keyboard?.on("keydown-F", () => {
      if (!this.menu) this.satchel?.lootFirst();
    });
    // the open menu's keys, the town's: Enter is the first choice, a number that choice; ← and →
    // move the OPTIONS panel's slider, one level a press (FS-28DDG § Change C6)
    this.input.keyboard?.on("keydown-ENTER", () => this.menuChoices?.confirm());
    this.input.keyboard?.on("keydown-LEFT", () => this.menuChoices?.nudge?.(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.menuChoices?.nudge?.(1));
    ["ONE", "TWO", "THREE"].forEach((name, i) =>
      this.input.keyboard?.on(`keydown-${name}`, () => this.menuChoices?.pick(i)),
    );
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // the satchel is laid out in logical units; Phaser's pointer.x/y are backing px (FS-ZAJMH R15)
      const at = viewport.toLogical(pointer);
      this.satchel?.pointerMove(at.x, at.y);
      // the map mode icon lit under the pointer, unless a panel lies over it (FS-56CKV §Change: Map mode icon, D7)
      if (this.panelTakes(at.x, at.y)) this.minimap?.pointerOut();
      else this.minimap?.pointerMove(at.x, at.y);
    });
    this.input.on("gameout", () => this.minimap?.pointerOut());
  }

  /**
   * A press over the overlay's panels is the overlay's, and a click on the open satchel a loot:
   * neither is an attack, a cast or a Shadow Shot hold. A press in the overlay's clear middle
   * band attacks as with it closed (FS-HRH2J R8).
   */
  private takesPointer(x: number, y: number, primary: boolean): boolean {
    // the open menu's rows take their own presses; nothing in the world answers one (FS-G4VMQ R5),
    // nor the map mode icon, whose guards the menu is one of
    if (this.menu) return true;
    if (this.panelTakes(x, y)) return true;
    // a press on the map mode icon is M's, never an attack or a cast (FS-56CKV §Change: Map mode icon, D6)
    if (this.minimap?.pointerDown(x, y, primary)) return true;
    return this.satchel?.pointerDown(x, y, primary) ?? false;
  }

  /**
   * Whether a press at (x, y), logical units, is the corner row's or a HUD panel's: the overlay's,
   * the chat window's, the party panel's or a prompt's. Neither the world nor the map mode icon
   * answers it.
   */
  private panelTakes(x: number, y: number): boolean {
    // a press on the corner row is the row's (FS-3EBCA R10)
    if (this.corner?.covers(x, y)) return true;
    if (this.equipment?.covers(x, y)) return true;
    // a press on the chat window is the window's: a toggle, the input, or nothing (FS-WJGFJ R31)
    if (this.chatWindow?.covers(x, y)) return true;
    // and one on the open party panel is the panel's (FS-R82NV R28)
    if (this.partyPanel?.covers(x, y)) return true;
    // and one on an invite prompt is the prompt's (FS-NCC9J R24)
    return this.invitePrompt?.covers(x, y) ?? false;
  }

  /** An item taken from the satchel: sent by the piles, and held in the inventory while pending. */
  private lootFromSatchel(item: ItemState): void {
    if (this.piles?.loot(item)) this.equipment?.taken(item);
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
    this.closeMenu();
    this.leavingHub = false;
    this.piles?.release();
    this.piles = undefined;
    this.satchel = undefined;
    this.equipment?.release();
    this.equipment = undefined;
    this.resourceHud = undefined;
    this.chatWindow?.destroy();
    this.chatWindow = undefined;
    this.partyPanel?.destroy();
    this.partyPanel = undefined;
    this.invitePrompt?.destroy();
    this.invitePrompt = undefined;
    this.partyFrames?.destroy();
    this.partyFrames = undefined;
    // what was charted since the last write, kept as the scene ends (FS-P0HSP §D.25)
    this.charting?.saveLast();
    this.minimap?.destroy();
    this.minimap = undefined;
    this.minimapStage = undefined;
    this.modeIconStage = undefined;
    this.charting = undefined;
    this.mapField = { walls: [], gates: [] };
    this.abilityHud = undefined;
    this.corner?.destroy();
    this.corner = undefined;
    this.lastState = undefined;
    this.selfAt = undefined;
    this.selfLevel = undefined;
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
    // the fight's hand or strike-mark is the field's: the next world sets its own
    this.input.setDefaultCursor("");
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
    const aiming = this.fight?.aiming === true || !!this.menu;
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
    this.selfLevel = me?.level;
    if (me) {
      this.equipment?.sync(me);
      // the overlay's stats panel, from this state (FS-HRH2J R24, R30)
      this.equipment?.updateCharacter(me);
    }
    this.equipment?.setCharacterLevel(me?.level);
    this.piles?.sync(state.containers ?? [], me?.id);
    if (this.selfAt) this.piles?.follow(this.selfAt);

    this.lastState = state;
    this.showClassHud(state);
    this.partyFrames?.show(state);
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
        button: this.fullscreenButton,
        // a press on its map mode icon is M's, under M's guards in a field (FS-56CKV §Change: Map mode icon, D6)
        icon: this.modeIconStage && { stage: this.modeIconStage, blocked: () => this.minimapKeysOwned() },
        // the field's name on it, as its arrival card titles it (FS-56CKV §Change: Map name, E1)
        name: minimapPlaceName({ world: "field", field: this.field }),
        // only M and the icon step it, both the player's (FS-WDM0X S7)
        stepped: () => this.sounds?.play("map_mode_switch"),
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
    return !!this.chatWindow?.isTyping() || !!this.menu;
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
    this.resourceHud ??= new ResourceHud(this, RESOURCE_HUD_AT.field.x, RESOURCE_HUD_AT.field.y);
    this.resourceHud.show(hudBars(state));
    this.showAbilityCard();
  }

  /** The ability card, redrawn on every state and as the lockout starts and ends (req 31). */
  private showAbilityCard(): void {
    const state = this.lastState;
    if (!state) return;
    // just above the corner row, right-aligned with it (FS-3EBCA R13)
    this.abilityHud ??= new AbilityHud(this, ABILITY_CARD_PLACE);
    this.abilityHud.show(abilityCard(state, { lockedOut: this.fight?.lockedOut ?? false, leaveUp: false }));
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

  /** A line said in passing, in the neutral HUD register. */
  private notice(text: string): void {
    const line = this.add
      .text(viewport.centerX, NOTICE_Y, text, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(BARROW_HEX.vellum),
        backgroundColor: toCss(BARROW_HEX.charcoal),
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);
    this.time.delayedCall(NOTICE_MS, () => line.destroy());
  }
}
