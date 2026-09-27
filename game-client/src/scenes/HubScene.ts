import Phaser from "phaser";
import { createAtmosphere } from "@/utils/atmosphere";
import { ActionType } from "@/assets/types/client";
import { useGameStore } from "@/stores/gameStore";
import { CANVAS_FONT, palette, shade, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import {
  ClientGameState,
  NPCState,
  PlayerState,
  WallState,
} from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import {
  ensureCharacterTextures,
  ensureVillagerTexture,
  drawDelverLegs,
  type Facing,
} from "@/utils/characterTextures";
import {
  WALL_HEIGHT,
  addUprightBlock,
  addWorldPlane,
  facingFrom,
  nearestScreenFacing,
  projectedBounds,
  standAt,
  worldDepth,
  worldToScreen,
  type Facing8,
  type Point,
} from "@/render/iso";
import { preloadArt, registerArt } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { CharacterAnimator } from "@/render/art/character";
import { AMBIENT, LightMap } from "@/render/lighting";
import { MARKER_DEPTH, markerBase } from "@/render/markers";
import {
  GroundLayer,
  Occluders,
  addProp,
  addRoof,
  addWalls,
  housesFrom,
  insideHouse,
  tileHash,
  worldSeed,
  type House,
} from "@/render/world";

/** Falls back to the warrior when a class is missing or unrecognised. */
function textureFor(playerClass: string | undefined, facing: Facing): string {
  const known = ["warrior", "mage", "archer"];
  const cls = (playerClass ?? "").toLowerCase();

  return `preview_${known.includes(cls) ? cls : "warrior"}_${facing}`;
}

/** Moves a world position a step toward its target. */
function easeToward(pos: Point, target: Point): void {
  pos.x = Phaser.Math.Linear(pos.x, target.x, POSITION_LERP);
  pos.y = Phaser.Math.Linear(pos.y, target.y, POSITION_LERP);
}

const HUB_WIDTH = 2000;
const HUB_HEIGHT = 1000;
/** Screen px of dark beyond the projected diamond the camera may show at the map edge. */
const CAMERA_MARGIN = 64;
const PLAYER_RADIUS = 20;
/**
 * Screen px from a delver's marker base (`markerBase`: a baked head, or the preview's frame top)
 * to the middle of their name label: a 60 px preview centred on the footprint keeps its label at
 * -34, where it always was.
 */
const NAME_GAP = 4;
/** How hard sprites chase the server's position each frame. Matches the run scene. */
const POSITION_LERP = 0.3;
/** Stride advance per server tick, matching the run scene. */
const WALK_STEP = 0.3;
/**
 * Scenery, at fixed points like everything else in the hub. None of it blocks —
 * see drawScenery — so it lives here rather than in the world.
 */
const HEARTH: [number, number] = [1000, 640];
/** How far a roof overhangs the walls it rests on. */
const ROOF_EAVE = 10;
/** A well, market stalls, two carts and some crates, all at fixed spots. */
const WELL: [number, number] = [820, 460];
const STALLS: [number, number][] = [
  [1240, 560],
  [700, 500],
  [1340, 900],
];
const CARTS: [number, number][] = [[540, 430], [1420, 900]];
const CRATES: [number, number][] = [
  [1300, 470], [1330, 500], [880, 900], [910, 872], [520, 760],
];
/** Fence runs: [x, y, length, horizontal]. */
const FENCES: [number, number, number, boolean][] = [
  [300, 760, 220, true],
  [1620, 300, 180, true],
  [700, 940, 260, true],
];
/** Lamp posts along the paths: the hub's lit places after dusk (FS-2325V §C.7). */
const LAMP_POSTS: [number, number][] = [
  [930, 490],
  [1090, 490],
  [690, 650],
  [1390, 650],
];
/** Trodden ground, joining the spawn to the people worth walking to. */
const PATHS: [number, number, number, number][] = [
  [940, 500, 130, 320],
  [700, 660, 360, 70],
  [1000, 660, 380, 70],
];
const TREES: [number, number][] = [
  [430, 300], [500, 360], [1420, 260], [1500, 330], [1470, 205],
  [180, 820], [260, 880], [1900, 600], [1900, 780], [560, 900],
  [700, 760], [1180, 880],
];
const GRASS: [number, number][] = [
  [560, 520], [640, 700], [820, 480], [880, 820], [1120, 500],
  [1240, 700], [1320, 560], [760, 600], [980, 880], [1400, 780],
  [160, 600], [1880, 480], [520, 780], [1000, 300], [900, 660],
];

/** The baked trees the hub's tree spots choose between, by a hash of the spot. */
const TREE_SHEETS = ["tree_oak", "tree_pine", "tree_oak_autumn"];
/** Seeds the hub's scenery variant picks, so every client plants the same trees. */
const SCENERY_SEED = 0x5343_4e31;

/** How close a delver stands to talk. Matches the server's NPCInteractRange. */
const NPC_TALK_RANGE = 80;

/**
 * What each function NPC offers, and what accepting it does.
 *
 * The dialogue itself is one shape — a line and two options — so adding an NPC
 * is adding a row here, not another branch in the scene. An NPC missing from this
 * table opens nothing, which is what an ambient resident is.
 */
/**
 * What a resident says when spoken to. They open nothing — the point is that a
 * delver never has to wonder whether an NPC is broken.
 */
const RESIDENT_LINES = [
  "The Spire took my brother's whole company.\nWe do not speak of it.",
  "Torches burn shorter down there. Mind that.",
  "You have the look of one who is going anyway.",
  "Quiet season. Fewer coming back to spend.",
];

const NPC_OFFERS: Record<
  string,
  {
    line: string;
    accepts: string;
    /** Omitted when there is nothing to decline — a resident, say. */
    declines?: string;
    accept: (scene: HubScene) => void;
  }
> = {
  delve: {
    line: "I keep the way into the Spire. Few return whole,\nand fewer return twice. Still set on descending?",
    accepts: "Descend",
    declines: "Not yet",
    accept: (scene) => scene.joinQueue(),
  },
  storekeeper: {
    line: "Steel rusts, and the barrow keeps what it takes.\nSee to your gear before you go down.",
    accepts: "Open pack",
    declines: "Later",
    accept: (scene) => scene.openLoadout(),
  },
};

/**
 * One delver as the scene sees them.
 *
 * The pieces are kept together because they live and die together: a delver who
 * leaves takes their sprite, their legs and their stride with them, and keeping
 * that as one entry means removal cannot half-happen.
 */
interface DelverView {
  /** The body, drawn at the projection of `pos`. */
  sprite: Phaser.GameObjects.Container;
  /**
   * Name plate: a marker, drawn above the light-map and vignette (FS-2325V §C.9), so it is
   * placed over the head each frame rather than riding in the depth-sorted container.
   */
  name: Phaser.GameObjects.Text;
  /** Drawn separately so the legs sit beneath the body. */
  legs: Phaser.GameObjects.Graphics;
  /** Where the server last said they are (world position). */
  target: Point;
  /** The eased world position the sprite is drawn at; eases toward `target`. */
  pos: Point;
  /** One of eight world directions (FS-2325V §A.6). */
  facing: Facing8;
  walkPhase: number;
  moving: boolean;
  /**
   * The class's baked sheet (FS-2325V §E.4). When it is not `baked`, the placeholder texture,
   * facing swaps and drawn legs above stand in.
   */
  anim: CharacterAnimator;
}

/**
 * The hub: the shared world delvers occupy between runs.
 *
 * Server-authoritative like a run — this renders broadcast state and sends
 * intents, never simulating. The map is larger than the viewport, so the camera
 * follows the player.
 *
 * Bare in this slice: buildings arrive with I-29KSH-3, NPCs with I-29KSH-6 and I-29KSH-8.
 */
export class HubScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  /** Everything the scene knows about one delver, keyed by entity id. */
  private views = new Map<string, DelverView>();
  private selfEntityID: string | null = null;

  /** Drawn once: the hub's buildings are fixed and never change. */
  private structuresDrawn = false;
  /** Drawn once, after the buildings arrive so it can avoid them. */
  private scenery?: Phaser.GameObjects.Graphics;
  /** The fire's flicker, so it reads as burning rather than painted. */
  private hearth?: Phaser.GameObjects.Graphics;
  /**
   * The hub's residents and its function NPCs, keyed by entity id.
   *
   * Residents walk, so each keeps a target the sprite eases toward — the same
   * treatment delvers get. Function NPCs never move, so their target simply
   * never changes.
   */
  private npcs = new Map<
    string,
    {
      state: NPCState;
      sprite: Phaser.GameObjects.Container;
      target: Point;
      /** Eased world position, as for delvers. */
      pos: Point;
      facing: Facing8;
      /** Set for residents, who turn; function NPCs keep their one texture. */
      texture?: string;
    }
  >();
  /** Whose dialogue is open, if any, and what its options do. */
  private dialogue?: Phaser.GameObjects.Container;
  private dialogueChoices?: { confirm: () => void; dismiss: () => void };
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private dismissKey?: Phaser.Input.Keyboard.Key;
  private interactKey?: Phaser.Input.Keyboard.Key;
  /** Shown while queued, wherever the delver walks. */
  private queuePanel?: Phaser.GameObjects.Text;
  /** Baked art (FS-2325V §B.6); an empty library draws placeholders. */
  private art!: ArtLibrary;
  /** Baked ground, when the manifest has it; otherwise the placeholder floor. */
  private groundLayer?: GroundLayer;
  /** FS-2325V §C.7: carries the delver's torch, replacing the overlay pool. */
  private lightMap?: LightMap;
  private occluders = new Occluders();
  /** Each house's roof, hidden while the delver stands inside it (FS-2325V §C.3). */
  private roofs: { house: House; parts: { setVisible(visible: boolean): unknown }[] }[] = [];
  private insideRoof?: House;
  private unsubscribeQueue?: () => void;

  private unsubscribeState?: () => void;
  private lastSent = { vx: 0, vy: 0 };

  constructor() {
    super({ key: "HubScene" });
  }

  preload(): void {
    // baked world and prop art (FS-2325V §B.6)
    preloadArt(this);
  }

  create(): void {
    // Clamped in projected space: the camera sees the diamond, and the dark beyond
    // its corners is the background colour. FS-2325V §A.3, §A.7.
    const bounds = projectedBounds(HUB_WIDTH, HUB_HEIGHT, CAMERA_MARGIN);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);

    ensureCharacterTextures(this);
    this.art = registerArt(this);
    this.occluders = new Occluders();

    // Baked ground with dirt paths when the manifest has it (FS-2325V §C.1).
    this.groundLayer = GroundLayer.available(this.art, "hub")
      ? new GroundLayer(this, this.art, {
          width: HUB_WIDTH,
          height: HUB_HEIGHT,
          kind: "hub",
          paths: PATHS.map(([x, y, width, height]) => ({ x, y, width, height })),
        })
      : undefined;
    if (!this.groundLayer) this.drawGround();
    this.bindInput();

    // Lit like a run, in warm dusk rather than barrow dark (FS-2325V §C.8): the
    // light-map with the delver's torch, then the vignette and dust above it.
    this.lightMap = new LightMap(this, AMBIENT.hub);
    createAtmosphere(this);

    this.unsubscribeState = socketManager.onGameStateUpdate((state) =>
      this.renderState(state),
    );

    // Queue progress follows the delver rather than pinning them to a popup:
    // they keep walking while they wait, so the panel has to be visible from
    // anywhere. FS-29KSH §Requirements 25, 27.
    socketManager.on("queue_status", (payload: { current?: number; total?: number }) =>
      this.showQueueProgress(payload?.current ?? 0, payload?.total ?? 0),
    );
    this.unsubscribeQueue = () => socketManager.off("queue_status");

    // DESTROY too: tearing the game down while in the hub (the page unmounts) skips SHUTDOWN.
    const release = () => {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, release);
      this.events.off(Phaser.Scenes.Events.DESTROY, release);
      this.unsubscribeState?.();
      this.unsubscribeQueue?.();
      this.views.clear();
      this.npcs.clear();
      this.closeDialogue();
      // the scene clock stops with the scene, so the flicker goes with it
      this.hearth = undefined;
      this.structuresDrawn = false;
      this.scenery = undefined;
      this.lightMap = undefined;
      this.groundLayer = undefined;
      this.roofs = [];
      this.insideRoof = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
    this.events.once(Phaser.Scenes.Events.DESTROY, release);
  }

  update(time: number, delta: number): void {
    this.sendMovementIntent();
    this.easeTowardServerPositions(time, delta);
    this.offerConversation();
    this.hideRoofOverhead();
    this.carryTheTorch(time, delta);
  }

  /**
   * Restamps the light-map with the delver's torch on the delver's drawn
   * position, and eases whatever stands over them (FS-2325V §C.5, §C.7).
   */
  private carryTheTorch(time: number, delta: number): void {
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    const body = self?.sprite.getByName("body") as Phaser.GameObjects.Sprite | null | undefined;

    this.lightMap?.carry(self ? { x: self.sprite.x, y: self.sprite.y } : null);
    this.lightMap?.update(time);
    this.occluders.update(
      self && body ? { bounds: body.getBounds(), depth: self.sprite.depth } : null,
      delta,
    );
  }

  /**
   * The roof of the house the delver stands in hides, and returns when they
   * leave: the run's inside test, on world positions (FS-2325V §C.3). The hub's
   * houses have no door today, so this waits for one that does.
   */
  private hideRoofOverhead(): void {
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    const inside = self ? this.roofs.find((r) => insideHouse(self.pos, r.house)) : undefined;
    if (inside?.house === this.insideRoof) return;
    this.roofs.forEach((r) => r.parts.forEach((p) => p.setVisible(r !== inside)));
    this.insideRoof = inside?.house;
  }

  /**
   * Opens a dialogue when the delver is standing close enough and presses to
   * talk. Walking past never does anything: joining the queue takes a choice,
   * not a collision. FS-29KSH §Requirements 24.
   */
  private offerConversation(): void {
    if (!this.interactKey) return;

    // While a dialogue is open the same key answers it, so a delver never has to
    // reach for the mouse to finish what the keyboard started.
    if (this.dialogue) {
      const talk = Phaser.Input.Keyboard.JustDown(this.interactKey);
      const confirm = this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey);
      const dismiss = this.dismissKey && Phaser.Input.Keyboard.JustDown(this.dismissKey);

      if (talk || confirm) this.dialogueChoices?.confirm();
      else if (dismiss) this.dialogueChoices?.dismiss();

      return;
    }

    if (!Phaser.Input.Keyboard.JustDown(this.interactKey)) return;

    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    if (!self) return;

    // World positions, never sprite positions: the sprites sit on the projection.
    for (const { state, pos } of this.npcs.values()) {
      const distance = Phaser.Math.Distance.Between(self.pos.x, self.pos.y, pos.x, pos.y);

      if (distance <= NPC_TALK_RANGE) {
        this.openDialogue(state);
        return;
      }
    }
  }

  /**
   * The server ticks at 30Hz and the screen redraws at 60. Applying broadcast
   * positions directly makes every delver — including your own — teleport twice
   * per three frames, which reads as juddering, and the camera chasing a target
   * that jumps is worse still. So sprites ease toward the last known position
   * instead, the same way the run scene does.
   */
  private easeTowardServerPositions(time: number, delta: number): void {
    // Easing happens in world space; the projection is applied only to draw.
    for (const npc of this.npcs.values()) {
      easeToward(npc.pos, npc.target);
      standAt(npc.sprite, npc.pos, 1);
    }

    for (const view of this.views.values()) {
      const { sprite, pos, target } = view;

      easeToward(pos, target);
      standAt(sprite, pos, 1);
      this.placeName(view);

      // A baked sheet walks and idles on its own legs, read off the position just
      // drawn; the hub has no attacks and no deaths.
      if (view.anim.baked) {
        const body = sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
        if (body) view.anim.show(body, view.anim.step(pos, time, delta, false));
        continue;
      }

      // Legs follow the eased sprite rather than the raw server position, and
      // sit just beneath the body on the same footprint.
      view.legs.setDepth(worldDepth(pos.x, pos.y, 0));
      drawDelverLegs(
        view.legs,
        sprite.x,
        sprite.y,
        nearestScreenFacing(view.facing),
        view.walkPhase,
        view.moving,
        BARROW_HEX.ink,
      );
    }
  }

  /**
   * The floor and the map edge. The edge is drawn, not simulated: the server
   * clamps movement to the world's bounds, so there are no wall entities here.
   */
  private drawGround(): void {
    // Drawn in world coordinates on a plane that carries the projection, so the
    // map is the diamond and the camera background fills the corners around it.
    const plane = addWorldPlane(this);
    plane.root.setDepth(0);

    const ground = this.add.graphics();
    ground.fillStyle(BARROW_HEX.charcoal, 1);
    ground.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    ground.lineStyle(4, BARROW_HEX.brass, 0.4);
    ground.strokeRect(0, 0, HUB_WIDTH, HUB_HEIGHT);
    plane.surface.add(ground);
  }

  /**
   * Trees, grass and a fire, and the lamp posts that light the paths.
   *
   * Baked props where the manifest has them (FS-2325V §C.1, §C.5, §C.7): trees,
   * bushes, barrels, a brazier on the hearth and lamp posts, the brazier and the
   * lamps declaring their light. The rest keep their placeholder drawing.
   *
   * All client-side and none of it blocks: anything a delver can walk into is a
   * building, and buildings are server entities so that collision and shape come
   * from one source. Scenery has no such obligation, so it costs the broadcast
   * nothing.
   *
   * The fire is ember, not amber. On the canvas amber means *interactable*, and
   * a delver cannot do anything with this one — an amber thing you cannot act on
   * is a defect (docs/design-guideline.md).
   */
  private drawScenery(walls: WallState[]): void {
    if (this.scenery || walls.length === 0) return;

    // Buildings are server entities and scenery is not, so the two are separate
    // lists of fixed coordinates with nothing but a person comparing them. A
    // tree grew inside a wall twice before this; now the scene simply declines
    // to draw anything standing in one.
    // Buildings are wider than their walls: the roof overhangs by ROOF_EAVE on
    // every side, and a prop clearing the wall by five pixels still ends up
    // sliced by the eave. The guard clears what a building *looks* like.
    const blocked = (x: number, y: number, radius: number) =>
      walls.some(
        (wall) =>
          x + radius >= wall.position.x - ROOF_EAVE &&
          x - radius <= wall.position.x + wall.width + ROOF_EAVE &&
          y + radius >= wall.position.y - ROOF_EAVE &&
          y - radius <= wall.position.y + wall.height + ROOF_EAVE,
      );

    // trodden paths lie on the ground, under everything else; baked ground lays
    // them as dirt tiles already
    const ground = addWorldPlane(this);
    ground.root.setDepth(2);
    const scenery = this.add.graphics();
    ground.surface.add(scenery);
    for (const [x, y, w, h] of this.groundLayer ? [] : PATHS) {
      scenery.fillStyle(BARROW_HEX.barrowBrown, 0.22);
      scenery.fillRect(x, y, w, h);
    }

    const baked = this.art.available;
    /** A baked prop on a footprint; tall ones fade over the delver, lit ones light. */
    const place = (sheet: string, at: Point, index: number, tall: boolean) => {
      const { sprite, light } = addProp(this, this.art, sheet, at, { index });
      if (tall) this.occluders.add([sprite]);
      if (light) this.lightMap?.add(light);
    };

    for (const [x, y] of LAMP_POSTS) {
      if (baked && !blocked(x, y, 12)) place("lamp_post", { x, y }, 0, true);
    }

    for (const [x, y] of GRASS) {
      if (blocked(x, y, 22)) continue;
      if (baked) {
        place("bush", { x, y }, tileHash(x, y, SCENERY_SEED), false);
        continue;
      }

      // A tuft, not three strokes: blades of varied height leaning slightly
      // apart, with a darker back rank so it reads as depth rather than a comb.
      const blades: [number, number, number, number][] = [
        [-14, 0, 4, 11], [-8, -3, 4, 16], [-2, -5, 5, 19],
        [4, -2, 4, 15], [10, 1, 4, 10], [15, -1, 3, 12],
      ];

      const tuft = this.propAt(x, y);
      tuft.fillStyle(BARROW_HEX.arcaneDeep, 0.55);
      for (const [dx, dy, w, h] of blades) {
        tuft.fillRect(x + dx, y + dy, w, h);
      }

      // the front rank, lighter, shorter, offset
      tuft.fillStyle(BARROW_HEX.arcane, 0.4);
      for (const [dx, dy, w, h] of blades) {
        tuft.fillRect(x + dx + 2, y + dy + 4, w - 1, h - 5);
      }
    }

    for (const [x, y] of TREES) {
      if (blocked(x, y - 10, 46)) continue;
      if (baked) {
        const pick = tileHash(x, y, SCENERY_SEED);
        place(TREE_SHEETS[pick % TREE_SHEETS.length], { x, y: y + 34 }, pick >>> 4, true);
        continue;
      }
      const prop = this.propAt(x, y + 34);

      // roots flaring into the ground, so the trunk sits in the earth rather
      // than on top of it
      prop.fillStyle(BARROW_HEX.pitch, 0.35);
      prop.fillEllipse(x, y + 34, 44, 12);

      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 8, y, 16, 34);
      prop.fillRect(x - 13, y + 26, 26, 8);
      // the shaded side of the bark
      prop.fillStyle(BARROW_HEX.pitch, 0.4);
      prop.fillRect(x + 2, y, 6, 34);
      // two boughs leaving the trunk
      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 18, y - 2, 12, 5);
      prop.fillRect(x + 7, y - 8, 12, 5);

      // the crown, built from overlapping masses rather than one disc
      prop.fillStyle(BARROW_HEX.arcaneDeep, 1);
      prop.fillCircle(x, y - 14, 32);
      prop.fillCircle(x - 22, y - 4, 22);
      prop.fillCircle(x + 21, y - 7, 21);
      prop.fillCircle(x - 6, y - 36, 22);
      prop.fillCircle(x + 14, y - 30, 18);

      // light catching the upper left, the way the torch pool falls
      prop.fillStyle(BARROW_HEX.arcane, 0.45);
      prop.fillCircle(x - 12, y - 26, 16);
      prop.fillCircle(x - 2, y - 38, 10);
      prop.fillStyle(BARROW_HEX.arcane, 0.25);
      prop.fillCircle(x + 10, y - 18, 12);

      // a few gaps, so the mass is not solid
      prop.fillStyle(BARROW_HEX.pitch, 0.3);
      prop.fillCircle(x + 6, y - 6, 6);
      prop.fillCircle(x - 18, y - 18, 5);
    }

    for (const [x, y, length, horizontal] of FENCES) {
      if (blocked(x, y, 20)) continue;

      // A fence runs along a world axis, which is a diagonal on screen, so each
      // post is projected on its own and the rails join the projected ends.
      const end = horizontal ? worldToScreen(x + length, y) : worldToScreen(x, y + length);
      const start = worldToScreen(x, y);
      const fence = this.add.graphics();
      fence.setDepth(
        worldDepth(horizontal ? x + length / 2 : x, horizontal ? y : y + length / 2),
      );
      fence.fillStyle(BARROW_HEX.barrowDeep, 1);

      const posts = Math.floor(length / 36);
      for (let i = 0; i <= posts; i++) {
        const post = worldToScreen(horizontal ? x + i * 36 : x, horizontal ? y : y + i * 36);
        fence.fillRect(post.x, post.y - 16, 5, 22);
      }

      // the rails between them
      if (horizontal) {
        fence.lineStyle(3, BARROW_HEX.barrowBrown, 1);
        fence.lineBetween(start.x, start.y - 11, end.x, end.y - 11);
        fence.lineBetween(start.x, start.y - 3, end.x, end.y - 3);
      }
    }

    for (const [x, y] of CRATES) {
      if (blocked(x, y, 14)) continue;
      if (baked) {
        place("barrel", { x, y }, 0, false);
        continue;
      }
      const prop = this.propAt(x, y);
      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 11, y - 11, 22, 22);
      prop.lineStyle(2, BARROW_HEX.barrowBrown, 0.9);
      prop.strokeRect(x - 11, y - 11, 22, 22);
      prop.lineBetween(x - 11, y - 11, x + 11, y + 11);
    }

    for (const [x, y] of CARTS) {
      if (blocked(x, y, 26)) continue;
      const prop = this.propAt(x, y + 11);
      prop.fillStyle(BARROW_HEX.barrowDeep, 1);
      prop.fillRect(x - 24, y - 10, 48, 20);
      prop.fillStyle(BARROW_HEX.barrowBrown, 1);
      prop.fillRect(x - 24, y - 14, 48, 5);
      // wheels
      prop.fillStyle(BARROW_HEX.pitch, 1);
      prop.fillCircle(x - 14, y + 11, 7);
      prop.fillCircle(x + 14, y + 11, 7);
      prop.fillStyle(BARROW_HEX.barrowBrown, 1);
      prop.fillCircle(x - 14, y + 11, 3);
      prop.fillCircle(x + 14, y + 11, 3);
      // the shaft
      prop.fillRect(x + 22, y - 2, 20, 4);
    }

    if (!blocked(WELL[0], WELL[1], 22)) {
      const [wx, wy] = WELL;
      const well = this.propAt(wx, wy);
      well.fillStyle(BARROW_HEX.slate, 1);
      well.fillCircle(wx, wy, 20);
      well.fillStyle(BARROW_HEX.pitch, 1);
      well.fillCircle(wx, wy, 13);
      // posts and a roof over it
      well.fillStyle(BARROW_HEX.barrowDeep, 1);
      well.fillRect(wx - 20, wy - 34, 5, 30);
      well.fillRect(wx + 15, wy - 34, 5, 30);
      well.fillStyle(BARROW_HEX.barrowBrown, 1);
      well.fillRect(wx - 26, wy - 40, 52, 8);
    }

    // The awnings are the one place a little colour is honest — a market is
    // meant to catch the eye — so they alternate rather than all matching.
    const awnings = [BARROW_HEX.oxblood, BARROW_HEX.arcaneDeep, BARROW_HEX.barrowBrown];

    STALLS.forEach(([sx, sy], i) => {
      if (blocked(sx, sy, 40)) return;
      const stall = this.propAt(sx, sy + 8);

      stall.fillStyle(BARROW_HEX.barrowDeep, 1);
      stall.fillRect(sx - 32, sy - 6, 64, 14);
      stall.fillRect(sx - 30, sy - 30, 4, 26);
      stall.fillRect(sx + 26, sy - 30, 4, 26);

      // goods on the counter
      stall.fillStyle(BARROW_HEX.vellumFaint, 0.7);
      stall.fillRect(sx - 24, sy - 12, 9, 7);
      stall.fillRect(sx - 6, sy - 11, 7, 6);
      stall.fillRect(sx + 12, sy - 13, 10, 8);

      stall.fillStyle(awnings[i % awnings.length], 0.85);
      stall.fillRect(sx - 36, sy - 36, 72, 9);
      stall.fillStyle(BARROW_HEX.vellumFaint, 0.5);
      stall.fillRect(sx - 36, sy - 30, 72, 3);
    });

    this.scenery = scenery;

    // The hearth: a baked brazier whose flame is a light source, or without art
    // the fire ring with a flickering ember flame.
    if (baked) {
      place("brazier", { x: HEARTH[0], y: HEARTH[1] }, 0, true);
      return;
    }

    // the fire ring, which does not move
    const ring = this.propAt(HEARTH[0], HEARTH[1]);
    ring.fillStyle(BARROW_HEX.slate, 1);
    ring.fillCircle(HEARTH[0], HEARTH[1], 26);
    ring.fillStyle(BARROW_HEX.pitch, 1);
    ring.fillCircle(HEARTH[0], HEARTH[1], 19);
    ring.fillStyle(BARROW_HEX.barrowDeep, 1);
    ring.fillRect(HEARTH[0] - 16, HEARTH[1] - 3, 32, 6);
    ring.fillRect(HEARTH[0] - 3, HEARTH[1] - 16, 6, 32);

    // the flame stands in the ring, drawn just above it
    this.hearth = this.propAt(HEARTH[0], HEARTH[1], 1);
    this.time.addEvent({ delay: 90, loop: true, callback: () => this.flicker() });
  }

  /**
   * A graphics for one upright prop whose art is written in absolute world-offset
   * style. The art point `(x, footY)`, where the prop meets the ground, lands on
   * that footprint's projection, and the rest of the art keeps its screen offsets
   * around it, unskewed. Sorted by the same footprint.
   */
  private propAt(x: number, footY: number, layer = 0): Phaser.GameObjects.Graphics {
    const s = worldToScreen(x, footY);
    const g = this.add.graphics();
    g.setPosition(s.x - x, s.y - footY);
    g.setDepth(worldDepth(x, footY, layer));
    return g;
  }

  /** Redraws the flame at a slightly different size each beat. */
  private flicker(): void {
    const fire = this.hearth;
    if (!fire?.scene) return;

    const [x, y] = HEARTH;
    const sway = Math.random() * 5;

    fire.clear();
    fire.fillStyle(BARROW_HEX.ember, 0.85);
    fire.fillCircle(x, y - 6 - sway * 0.4, 11 + sway * 0.5);
    fire.fillStyle(BARROW_HEX.amberBright, 0.7);
    fire.fillCircle(x, y - 9 - sway * 0.6, 6 + sway * 0.3);
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.dismissKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  /**
   * Sends velocity only when it changes, rather than every frame.
   */
  private sendMovementIntent(): void {
    if (!this.cursors || !this.wasd) return;

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);

    if (vx === this.lastSent.vx && vy === this.lastSent.vy) return;

    this.lastSent = { vx, vy };
    socketManager.sendMessage(ActionType.Move, { vx, vy });
  }

  private renderState(state: ClientGameState): void {
    if (state.world_type && state.world_type !== "hub") return;

    const present = new Set<string>();

    if (state.current_player) {
      this.placeDelver(state.current_player, true);
      present.add(state.current_player.entity_id);

      if (this.selfEntityID !== state.current_player.entity_id) {
        this.selfEntityID = state.current_player.entity_id;
        const self = this.views.get(this.selfEntityID);
        if (self) this.cameras.main.startFollow(self.sprite, true, 0.1, 0.1);
      }
    }

    this.renderStructures(state.walls ?? []);
    // Scenery waits for the buildings so it can refuse to stand inside one.
    this.drawScenery(state.walls ?? []);
    this.renderNPCs(state.npcs ?? []);

    for (const other of state.other_players ?? []) {
      this.placeDelver(other, false);
      present.add(other.entity_id);
    }

    // anyone who left the hub since the last tick
    for (const [entityID, view] of this.views) {
      if (present.has(entityID)) continue;

      view.sprite.destroy();
      view.name.destroy();
      view.legs.destroy();
      this.views.delete(entityID);
    }
  }

  /**
   * Turns a delver to face where they are going, and advances their stride.
   *
   * The character textures have no walk frames — one static image per class per
   * facing — so the stride is animated by drawing legs, the same as in a run.
   */
  private updateAppearance(view: DelverView, player: PlayerState): void {
    // a baked sheet is turned and strided each frame instead (easeTowardServerPositions)
    if (view.anim.baked) return;
    const { vx, vy } = player.direction ?? { vx: 0, vy: 0 };

    view.moving = vx !== 0 || vy !== 0;
    view.walkPhase = view.moving ? view.walkPhase + WALK_STEP : 0;

    // Eight world directions; the placeholder textures show the nearest of their four.
    const facing = facingFrom(vx, vy, view.facing);
    if (facing === view.facing) return;

    view.facing = facing;
    const body = view.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    body?.setTexture(textureFor(player.class, nearestScreenFacing(facing)));
  }

  private showQueueProgress(current: number, total: number): void {
    const text = `Gathering the delve  ${current}/${total}`;

    if (this.queuePanel) {
      this.queuePanel.setText(text);
      return;
    }

    this.queuePanel = this.add
      .text(24, this.cameras.main.height - 44, text, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(BARROW_HEX.amber),
        backgroundColor: toCss(BARROW_HEX.charcoal),
        padding: { x: 12, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /**
   * Draws the hub's buildings.
   *
   * They are server entities, so the collision a delver feels and the shape they
   * see come from one source — an invisible wall is worse than no wall. Fixed,
   * so this runs once rather than every tick.
   */
  private renderStructures(walls: WallState[]): void {
    if (this.structuresDrawn || walls.length === 0) return;

    // Baked wall pieces and corner posts (FS-2325V §C.2); without a manifest,
    // placeholder upright blocks, one-tile pieces each sorted by footprint.
    const houses = housesFrom(walls);
    const baked = addWalls(this, this.art, walls, worldSeed("hub"));
    if (baked) {
      this.occluders.add(baked.tall);
      // a back wall's flame is in sight only while its house's roof is off
      const houseOf = new Map(walls.map((w) => [w.entity_id, houses.find((h) => h.id === w.house_id)]));
      baked.lights.forEach(({ source, wallId, underRoof }) => {
        const house = houseOf.get(wallId);
        this.lightMap?.add(source, underRoof && house ? () => this.insideRoof === house : undefined);
      });
    } else {
      for (const wall of walls) {
        addUprightBlock(this, wall.position.x, wall.position.y, wall.width, wall.height, {
          top: BARROW_HEX.barrowDeep,
          south: shade(BARROW_HEX.barrowDeep, 0.3),
          east: shade(BARROW_HEX.barrowDeep, 0.5),
          edge: { width: 2, color: BARROW_HEX.barrowBrown, alpha: 0.8 },
        });
      }
    }

    // Walls carry the building they belong to, so the footprints can be
    // reassembled here rather than being a second list to keep in step with the
    // server's. Flagstone goes under each, and a roof on top: baked slope and
    // ridge pieces sorted by their own footprints (FS-2325V §C.3), or without art
    // a placeholder roof on a plane lifted to the wall tops.
    this.groundLayer?.paint(houses);
    for (const house of houses) {
      const roof = addRoof(this, this.art, house);
      if (roof) this.occluders.add(roof);
      this.roofs.push({ house, parts: roof ?? [this.placeholderRoof(house)] });
    }

    // One flag covers both: the walls and their roofs are drawn together.
    this.structuresDrawn = true;
  }

  /** The pre-art roof: two shaded slopes on a plane lifted to the wall tops. */
  private placeholderRoof(house: House): Phaser.GameObjects.Container {
    const roofPlane = addWorldPlane(this, WALL_HEIGHT);
    // sorted by the centre of its footprint: over a delver behind the house, under one in front
    roofPlane.root.setDepth(worldDepth(house.x + house.width / 2, house.y + house.height / 2));
    const roof = this.add.graphics();
    roofPlane.surface.add(roof);
    this.roofOver(roof, { x: house.x, y: house.y, w: house.width, h: house.height });
    return roofPlane.root;
  }

  /**
   * Puts a roof on a footprint.
   *
   * Seen from above, a pitched roof is two slopes meeting at a ridge, so it is
   * drawn as two shaded halves either side of a line — lit on the side the torch
   * pool falls from — with the eaves overhanging the walls they sit on.
   */
  private roofOver(
    g: Phaser.GameObjects.Graphics,
    { x, y, w, h }: { x: number; y: number; w: number; h: number },
  ): void {
    const eave = ROOF_EAVE;
    const left = x - eave;
    const top = y - eave;
    const width = w + eave * 2;
    const height = h + eave * 2;

    // the ridge runs along the longer side
    const alongX = width >= height;
    const ridge = alongX ? top + height / 2 : left + width / 2;

    g.fillStyle(BARROW_HEX.barrowBrown, 1);
    g.fillRect(left, top, width, height);

    // the far slope, in shadow
    g.fillStyle(BARROW_HEX.pitch, 0.28);
    if (alongX) {
      g.fillRect(left, ridge, width, height / 2);
    } else {
      g.fillRect(ridge, top, width / 2, height);
    }

    // thatch: courses running with the pitch, not across it
    g.lineStyle(1, BARROW_HEX.pitch, 0.2);
    const step = 7;
    if (alongX) {
      for (let ly = top + step; ly < top + height; ly += step) {
        g.lineBetween(left, ly, left + width, ly);
      }
    } else {
      for (let lx = left + step; lx < left + width; lx += step) {
        g.lineBetween(lx, top, lx, top + height);
      }
    }

    // the ridge beam, and the eave line all round
    g.lineStyle(3, BARROW_HEX.barrowDeep, 1);
    if (alongX) {
      g.lineBetween(left, ridge, left + width, ridge);
    } else {
      g.lineBetween(ridge, top, ridge, top + height);
    }

    g.lineStyle(2, BARROW_HEX.barrowDeep, 0.9);
    g.strokeRect(left, top, width, height);
  }

  /** Draws the hub's residents. They stand still, so this runs once each. */
  private renderNPCs(npcs: NPCState[]): void {
    for (const npc of npcs) {
      const existing = this.npcs.get(npc.entity_id);

      if (existing) {
        // A resident faces the way they are walking, worked out from where the
        // server has moved them since the last tick (world positions).
        const facing = facingFrom(
          npc.position.x - existing.target.x,
          npc.position.y - existing.target.y,
          existing.facing,
        );

        existing.target = { x: npc.position.x, y: npc.position.y };

        if (facing !== existing.facing && existing.texture) {
          existing.facing = facing;
          const body = existing.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
          body?.setTexture(`${existing.texture}_${nearestScreenFacing(facing)}`);
        }

        continue;
      }

      // Residents are ordinary folk and are drawn as such; the two function NPCs
      // keep the delver silhouette, tinted brass so it is legible at a glance
      // which of them is worth crossing the hub for.
      const isFunction = npc.function !== "";
      const tone = isFunction ? BARROW_HEX.brassBright : BARROW_HEX.vellum;
      const texture = isFunction
        ? undefined
        : ensureVillagerTexture(this, npc.appearance ?? "green_trousers");

      const body = texture
        ? this.add.sprite(0, 0, `${texture}_down`)
        : this.add.sprite(0, 0, textureFor("warrior", "down")).setTint(tone);
      body.setName("body");

      const name = this.add
        .text(0, -PLAYER_RADIUS - 14, npc.name, {
          fontFamily: CANVAS_FONT.body,
          fontSize: "12px",
          color: toCss(tone),
        })
        .setOrigin(0.5);

      const pos = { x: npc.position.x, y: npc.position.y };
      const sprite = this.add.container(0, 0, [body, name]);
      standAt(sprite, pos, 1);

      this.npcs.set(npc.entity_id, {
        state: npc,
        sprite,
        target: { ...pos },
        pos,
        // faces the viewer, which the "down" texture shows
        facing: "se",
        texture,
      });
    }
  }

  /**
   * A line of who they are, and a choice. Not a dialogue tree: no branching, no
   * memory of what was said. FS-29KSH §Requirements 24, §Out of Scope.
   */
  private openDialogue(npc: NPCState): void {
    const offer = NPC_OFFERS[npc.function] ?? {
      line: RESIDENT_LINES[
        // stable per resident, so they do not change their mind each time
        [...npc.entity_id].reduce((sum, c) => sum + c.charCodeAt(0), 0) %
          RESIDENT_LINES.length
      ],
      // A resident has nothing to offer, so they offer no choice. Two options
      // that both close the box is a decision the delver does not have.
      accepts: "Leave",
      declines: undefined,
      accept: () => {},
    };

    const { width, height } = this.cameras.main;
    const panel = this.add.graphics();
    panel.fillStyle(BARROW_HEX.charcoal, 0.96);
    panel.fillRect(-300, -90, 600, 180);
    panel.lineStyle(1, BARROW_HEX.brass, 0.5);
    panel.strokeRect(-300, -90, 600, 180);

    const speaker = this.add
      .text(0, -60, npc.name, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(BARROW_HEX.brassBright),
      })
      .setOrigin(0.5);

    const line = this.add
      .text(0, -18, offer.line, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(BARROW_HEX.vellum),
        align: "center",
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    const confirm = () => {
      this.closeDialogue();
      offer.accept(this);
    };
    const dismiss = () => this.closeDialogue();

    this.dialogueChoices = { confirm, dismiss };

    const choices: Phaser.GameObjects.GameObject[] = offer.declines
      ? [
          this.dialogueOption(-90, 48, `${offer.accepts}  [E]`, BARROW_HEX.amber, confirm),
          this.dialogueOption(90, 48, `${offer.declines}  [Esc]`, BARROW_HEX.arcane, dismiss),
        ]
      : [this.dialogueOption(0, 48, `${offer.accepts}  [E]`, BARROW_HEX.amber, confirm)];

    this.dialogue = this.add
      .container(width / 2, height / 2, [panel, speaker, line, ...choices])
      .setScrollFactor(0)
      .setDepth(2000);
  }

  private dialogueOption(
    x: number,
    y: number,
    label: string,
    colour: number,
    onPick: () => void,
  ): Phaser.GameObjects.Container {
    const text = this.add
      .text(0, 0, label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "15px",
        color: toCss(colour),
      })
      .setOrigin(0.5);

    const option = this.add.container(x, y, [text]);
    // A Container has no texture, so it has no hit area to infer: without an
    // explicit shape here the option looks clickable and is not.
    option.setSize(160, 34);
    option.setInteractive(
      new Phaser.Geom.Rectangle(-80, -17, 160, 34),
      Phaser.Geom.Rectangle.Contains,
    );
    this.input.setDefaultCursor("default");
    option.on("pointerover", () => this.input.setDefaultCursor("pointer"));
    option.on("pointerout", () => this.input.setDefaultCursor("default"));
    option.on("pointerup", onPick);
    option.on("pointerover", () => text.setColor(toCss(BARROW_HEX.vellum)));
    option.on("pointerout", () => text.setColor(toCss(colour)));

    return option;
  }

  private closeDialogue(): void {
    this.dialogue?.destroy();
    this.dialogue = undefined;
    this.dialogueChoices = undefined;
  }

  /** The loadout is a screen, not a world: the delver stays in the hub while it
   * is open, standing where they were. */
  openLoadout(): void {
    this.scene.start("LoadoutScene");
  }

  /** Joining is the delver's decision; the queue itself is unchanged. */
  joinQueue(): void {
    const character = useGameStore.getState().getActiveCharacter();
    const chosenClass = (character?.className ?? "warrior").toLowerCase();

    socketManager.sendMessage(ActionType.Find_Game, {
      class: chosenClass,
      className: chosenClass,
      characterName: character?.name ?? "",
      username: character?.name ?? "",
    });
  }

  /** A delver's name plate over their head ({@link markerBase}); the hub has no corpses. */
  private placeName(view: DelverView): void {
    const body = view.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    if (!body) return;
    const base = markerBase(
      {
        y: view.sprite.y + body.y,
        displayOriginY: body.displayOriginY,
        scaleY: body.scaleY,
      },
      view.anim.crown,
      false,
    );
    view.name.setPosition(view.sprite.x + body.x, (base ?? view.sprite.y) - NAME_GAP);
  }

  private placeDelver(player: PlayerState, isSelf: boolean): void {
    const existing = this.views.get(player.entity_id);

    // Existing delvers ease toward the target in update(); only a delver seen
    // for the first time is placed outright, so it does not slide in from the
    // origin.
    if (existing) {
      existing.target = { x: player.position.x, y: player.position.y };
      this.updateAppearance(existing, player);
      return;
    }

    // The same sprites the character-select screen previews, so the delver a
    // player picked is the delver they see.
    const body = this.add.sprite(0, 0, textureFor(player.class, "down"));
    body.setName("body");

    // The class's baked sheet, stood on its footprint by the sheet's anchor
    // (FS-2325V §E.5), others untinted as rivals are in a run (§E.3); the preview
    // texture, others dimmed, only when the sheet is missing.
    const anim = new CharacterAnimator(this.art, player.class);
    if (anim.baked) anim.dress(body);
    else if (!isSelf) body.setTint(BARROW_HEX.vellumDark);

    // a marker above the lighting, placed by placeName: a 60 px preview keeps it where it
    // always was, a baked sheet puts it just over the head
    const name = this.add
      .text(0, 0, player.username, {
        fontFamily: "var(--font-body), serif",
        fontSize: "12px",
        color: toCss(palette.markerHub),
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);

    const pos = { x: player.position.x, y: player.position.y };
    const sprite = this.add.container(0, 0, [body]);
    standAt(sprite, pos, 1);

    // Beneath the body, so a stride reads as legs under a cloak.
    const legs = this.add.graphics();
    legs.setDepth(worldDepth(pos.x, pos.y, 0));

    const view: DelverView = {
      sprite,
      name,
      legs,
      target: { ...pos },
      pos,
      // faces the viewer, which the "down" texture shows
      facing: "se",
      walkPhase: 0,
      moving: false,
      anim,
    };
    this.placeName(view);
    this.views.set(player.entity_id, view);
  }
}
