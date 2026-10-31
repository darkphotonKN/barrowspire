import * as Phaser from "phaser";
import { ActionType, type FieldId } from "@/assets/types/client";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import type { ClientGameState, GateState, ItemState, PlayerState, Position, WallState } from "@/types/gameState";
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
import { ContainerView } from "@/ui/ContainerView";
import { GearOverlay } from "@/ui/GearOverlay";
import { EquipmentHud } from "@/ui/EquipmentHud";
import { ResourceHud } from "@/ui/ResourceHud";
import { ChatWindow, mountChatWindow } from "@/ui/ChatWindow";
import { PartyPanel, mountPartyPanel } from "@/ui/PartyPanel";
import { PartyFrames, mountPartyFrames } from "@/ui/PartyFrames";
import { AbilityHud } from "@/ui/AbilityHud";
import { abilityCard } from "@/ui/abilityCard";
import { hudBars } from "@/ui/resources";
import { createAtmosphere } from "@/utils/atmosphere";
import { fieldCombatOnScene, type FieldCombat } from "./fieldCombat";
import { FieldPiles } from "./fieldPiles";
import { FallenCountdown, fallenCopy, isFallen } from "./fieldFallen";
import { fieldRefusalCopy } from "./fieldRefusals";
import { gateAt, gateEdges } from "./hubGates";

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
 * bars bottom-left, the ability card bottom-right, the archer's Shadow Shot hold (the keys read
 * released while it is drawn) and the Mercenary's cut, riposte and parry, all through `fieldCombat`.
 *
 * Walking into the entrance gate sends one leave_field and waits for world_entered or a refusal,
 * as the hub does for its own sends (§Requirements 57).
 *
 * A fallen player lies in the run scene's death pose under a short fallen state counting 3-2-1,
 * then stands at the entrance: no result card, no loss copy (§Requirements 58).
 */

/** Each field's size in world px, as the server builds it (FS-X2F2H §Requirements 51). */
const FIELD_SIZE: Record<FieldId, { width: number; height: number }> = {
  gentle_meadows: { width: 2000, height: 1000 },
  // 39 x 25 cells of 80 px, constants.ForestMapWidth/Height (FS-KSD6K §Requirements 1, 17)
  forlorn_forest: { width: 3120, height: 2000 },
};

const CAMERA_MARGIN = 120;
const POSITION_LERP = 0.3;
const NAME_GAP = 4;
const NOTICE_Y = 72;
const NOTICE_MS = 3200;
/** The run's HUD corners: the resource bars bottom-left, the ability card bottom-right (FS-8AY7S req 20, 29). */
const RESOURCE_HUD_X = 10;
const HUD_MARGIN = 16;

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
  private lastSent = { vx: 0, vy: 0 };

  private field: FieldId = "gentle_meadows";
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
  /** The player's own fall and its 3-2-1 (§Requirements 58). */
  private fallen = new FallenCountdown();
  private fallenLine?: Phaser.GameObjects.Text;
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
  private abilityHud?: AbilityHud;
  /** The latest field state, for the ability card's redraw as the lockout starts and ends. */
  private lastState?: ClientGameState;
  /** The player's server-reported position and level, for reaching a pile and the satchel's marks. */
  private selfAt?: Point;
  private selfLevel?: number;
  private unsubscribeState?: () => void;

  constructor() {
    super({ key: "FieldScene" });
  }

  preload(): void {
    preloadArt(this);
  }

  create(data?: { field?: FieldId }): void {
    this.field = data?.field ?? "gentle_meadows";
    this.look = fieldLook(this.field);
    this.size = FIELD_SIZE[this.field] ?? FIELD_SIZE.gentle_meadows;
    const { width, height } = this.size;

    const camera = this.cameras.main;
    const bounds = projectedBounds(width, height, CAMERA_MARGIN);
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);

    ensureCharacterTextures(this);
    this.art = registerArt(this);
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
      lockout: () => this.showAbilityCard(),
    });
    this.createPiles();
    this.equipment = this.composeEquipment();
    this.bindHudKeys();

    this.unsubscribeState = socketManager.onGameStateUpdate((state) => this.renderState(state));
    this.listen();
    this.chatWindow = mountChatWindow(this, () => !this.equipment?.isOpen());
    // T: the party panel, under the same key owners as the chat input (FS-R82NV R28)
    this.partyPanel = mountPartyPanel(this, () => !!this.equipment?.isOpen());
    // the teammates' frames: bars for those this field's state shows, a word for the rest (FS-R82NV R34)
    this.partyFrames = mountPartyFrames(this, this.art);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.release, this);
  }

  /** The field's answer to leaving: a refusal keeps the player here and says why. */
  private listen(): void {
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
   * satchel (FS-3QHQZ §Requirements 19). E reaches for the nearest pile or chest, F takes its
   * first item, a click on the open satchel takes that one.
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
   * full-bag refusals in the field's notice (R22).
   */
  private composeEquipment(): EquipmentHud {
    return new EquipmentHud(new GearOverlay(this, this.art), {
      send: (action, payload) => socketManager.sendMessage(action, payload),
      notice: (text) => this.notice(text),
    });
  }

  /** Whether the bag can take one more pickup from a pile or chest (FS-HRH2J R21); the notice says when not. */
  private bagHasRoom(): boolean {
    return this.equipment?.roomForOne() ?? true;
  }

  /**
   * The run's keys for the satchel and the equip HUD: I or B opens and closes the overlay, Q and
   * ESC close it (FS-HRH2J R4; a field has no ESC menu); E over the open overlay equips or
   * unequips, as in the run, else reaches for a pile or chest; F takes the satchel's first item.
   */
  private bindHudKeys(): void {
    this.input.keyboard?.on("keydown-E", () => {
      if (this.equipment?.equipKey()) return;
      if (this.selfAt && !this.fallen.isDown()) this.piles?.interact(this.selfAt);
    });
    for (const key of ["keydown-I", "keydown-B"]) {
      this.input.keyboard?.on(key, () => {
        this.equipment?.toggle();
        // opening the overlay ends a Shadow Shot hold (FS-JTNPR req 15)
        if (this.equipment?.isOpen()) this.fight?.cancelAim();
      });
    }
    this.input.keyboard?.on("keydown-Q", () => this.equipment?.hide());
    this.input.keyboard?.on("keydown-ESC", () => this.equipment?.hide());
    this.input.keyboard?.on("keydown-F", () => this.satchel?.lootFirst());
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.satchel?.pointerMove(pointer.x, pointer.y));
  }

  /**
   * A press over the overlay's panels is the overlay's, and a click on the open satchel a loot:
   * neither is an attack, a cast or a Shadow Shot hold. A press in the overlay's clear middle
   * band attacks as with it closed (FS-HRH2J R8).
   */
  private takesPointer(x: number, y: number, primary: boolean): boolean {
    if (this.equipment?.covers(x, y)) return true;
    // a press on the chat window is the window's: a toggle, the input, or nothing (FS-WJGFJ R31)
    if (this.chatWindow?.covers(x, y)) return true;
    // and one on the open party panel is the panel's (FS-R82NV R28)
    if (this.partyPanel?.covers(x, y)) return true;
    return this.satchel?.pointerDown(x, y, primary) ?? false;
  }

  /** An item taken from the satchel: sent by the piles, and held in the inventory while pending. */
  private lootFromSatchel(item: ItemState): void {
    if (this.piles?.loot(item)) this.equipment?.taken(item);
  }

  /** Everything one visit made is let go: Phaser reuses the scene instance for the next. */
  private release(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.release, this);
    this.unsubscribeState?.();
    socketManager.offError(ActionType.LeaveField);
    socketManager.off(ActionType.Interact);
    this.piles?.release();
    this.piles = undefined;
    this.satchel = undefined;
    this.equipment = undefined;
    this.resourceHud = undefined;
    this.chatWindow?.destroy();
    this.chatWindow = undefined;
    this.partyPanel?.destroy();
    this.partyPanel = undefined;
    this.partyFrames?.destroy();
    this.partyFrames = undefined;
    this.abilityHud = undefined;
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
    this.fallenLine?.destroy();
    this.fallenLine = undefined;
    this.fight?.release();
    this.fight = undefined;
    this.lightMap = undefined;
    this.lastSent = { vx: 0, vy: 0 };
  }

  update(time: number, delta: number): void {
    this.sendMovementIntent();
    this.fight?.update(delta);
    const count = this.fallen.count(this.time.now);
    if (count !== undefined) this.fallenLine?.setText(fallenCopy(count));
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

  /** Velocity, sent only when it changes. */
  private sendMovementIntent(): void {
    if (!this.cursors || !this.wasd) return;
    // the fallen do not walk; the server would refuse it
    if (this.fallen.isDown()) return;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    // the keys read released while an archer draws a Shadow Shot (FS-JTNPR req 9)
    const aiming = this.fight?.aiming === true;
    const vx = aiming ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
    const vy = aiming ? 0 : (down ? 1 : 0) - (up ? 1 : 0);
    if (vx === this.lastSent.vx && vy === this.lastSent.vy) return;
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
  }

  /**
   * The run's Health and class resource bars and its ability card (FS-8AY7S req 20–32), by the
   * same rules: up while the player stands in the field, down while they lie fallen. A field has
   * no leave button to share the card's corner.
   */
  private showClassHud(state: ClientGameState): void {
    const { height } = this.cameras.main;
    this.resourceHud ??= new ResourceHud(this, RESOURCE_HUD_X, height - HUD_MARGIN);
    this.resourceHud.show(hudBars(state));
    this.chatWindow?.setBottom(this.resourceHud.topEdge());
    this.showAbilityCard();
  }

  /** The ability card, redrawn on every state and as the lockout starts and ends (req 31). */
  private showAbilityCard(): void {
    const state = this.lastState;
    if (!state) return;
    const { width, height } = this.cameras.main;
    this.abilityHud ??= new AbilityHud(this, width - HUD_MARGIN, height - HUD_MARGIN);
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
      const { width, height } = this.cameras.main;
      this.fallenLine = this.add
        .text(width / 2, height / 2, fallenCopy(this.fallen.count(this.time.now) ?? 3), {
          fontFamily: CANVAS_FONT.body,
          fontSize: "18px",
          color: toCss(BARROW_HEX.vellum),
          backgroundColor: toCss(BARROW_HEX.charcoal),
          padding: { x: 16, y: 10 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1000);
    } else if (change === "rose") {
      this.fallenLine?.destroy();
      this.fallenLine = undefined;
      // the server stopped them as they fell: a key still held is sent again
      this.lastSent = { vx: 0, vy: 0 };
    }
  }

  /** Home through the road: one leave_field, and nothing more until it is answered. */
  private leave(): void {
    if (this.leavingField) return;
    this.leavingField = true;
    socketManager.sendMessage(ActionType.LeaveField, {});
  }

  private keepCameraOn(sprite: Phaser.GameObjects.Container): void {
    if (sprite === this.followedSprite) return;
    this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
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

  private placePlayer(player: PlayerState, isSelf: boolean): void {
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
    const { width } = this.cameras.main;
    const line = this.add
      .text(width / 2, NOTICE_Y, text, {
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
