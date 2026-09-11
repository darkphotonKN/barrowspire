import Phaser from "phaser";
import { createAtmosphere } from "@/utils/atmosphere";
import { ActionType } from "@/assets/types/client";
import { useGameStore } from "@/stores/gameStore";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";
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

/**
 * Reassembles each building from the walls that belong to it.
 *
 * Every wall carries the id of the building it is part of, so the footprint is
 * the bounding box of its group — no second list of coordinates to drift out of
 * step with the server's.
 */
function footprintsFrom(
  walls: WallState[],
): { x: number; y: number; w: number; h: number }[] {
  const byBuilding = new Map<string, WallState[]>();

  for (const wall of walls) {
    if (!wall.house_id) continue;
    const group = byBuilding.get(wall.house_id) ?? [];
    group.push(wall);
    byBuilding.set(wall.house_id, group);
  }

  return [...byBuilding.values()].map((group) => {
    const x = Math.min(...group.map((w) => w.position.x));
    const y = Math.min(...group.map((w) => w.position.y));
    const right = Math.max(...group.map((w) => w.position.x + w.width));
    const bottom = Math.max(...group.map((w) => w.position.y + w.height));

    return { x, y, w: right - x, h: bottom - y };
  });
}

/** Falls back to the warrior when a class is missing or unrecognised. */
function textureFor(playerClass: string | undefined, facing: Facing): string {
  const known = ["warrior", "mage", "archer"];
  const cls = (playerClass ?? "").toLowerCase();

  return `preview_${known.includes(cls) ? cls : "warrior"}_${facing}`;
}

/**
 * Which way a delver is looking, from the dominant axis of their velocity —
 * the same rule the run scene uses, so a delver turns the same way in both
 * worlds. Standing still keeps the last facing rather than snapping to a
 * default.
 */
function facingFrom(vx: number, vy: number, current: Facing): Facing {
  if (vx === 0 && vy === 0) return current;

  if (Math.abs(vy) >= Math.abs(vx)) return vy < 0 ? "up" : "down";

  return vx < 0 ? "left" : "right";
}

const HUB_WIDTH = 2000;
const HUB_HEIGHT = 1000;
const PLAYER_RADIUS = 20;
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
  /** Sprite and name label. */
  sprite: Phaser.GameObjects.Container;
  /** Drawn separately so the legs sit in world space beneath the body. */
  legs: Phaser.GameObjects.Graphics;
  /** Where the server last said they are; the sprite eases toward it. */
  target: { x: number; y: number };
  facing: Facing;
  walkPhase: number;
  moving: boolean;
}

/**
 * The hub: the shared world delvers occupy between runs.
 *
 * Server-authoritative like a run — this renders broadcast state and sends
 * intents, never simulating. The map is larger than the viewport, so the camera
 * follows the player.
 *
 * Bare in this slice: buildings arrive with I-0047, NPCs with I-0050 and I-0052.
 */
export class HubScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  /** Everything the scene knows about one delver, keyed by entity id. */
  private views = new Map<string, DelverView>();
  private selfEntityID: string | null = null;

  /** Drawn once: the hub's buildings are fixed and never change. */
  private structures?: Phaser.GameObjects.Graphics;
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
      target: { x: number; y: number };
      facing: Facing;
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
  /** The warm pool the delver carries. Camera-fixed, so positioned in screen space. */
  private torchPool?: Phaser.GameObjects.Image;
  private unsubscribeQueue?: () => void;

  private unsubscribeState?: () => void;
  private lastSent = { vx: 0, vy: 0 };

  constructor() {
    super({ key: "HubScene" });
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, HUB_WIDTH, HUB_HEIGHT);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);

    ensureCharacterTextures(this);

    this.drawGround();
    this.bindInput();

    // Dark, never flat: the hub is lit the same way a run is.
    // docs/design-guideline.md — heavy vignette plus a warm torch pool.
    this.torchPool = createAtmosphere(this).torch;

    this.unsubscribeState = socketManager.onGameStateUpdate((state) =>
      this.renderState(state),
    );

    // Queue progress follows the delver rather than pinning them to a popup:
    // they keep walking while they wait, so the panel has to be visible from
    // anywhere. FS-0008 §Requirements 25, 27.
    socketManager.on("queue_status", (payload: { current?: number; total?: number }) =>
      this.showQueueProgress(payload?.current ?? 0, payload?.total ?? 0),
    );
    this.unsubscribeQueue = () => socketManager.off("queue_status");

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeQueue?.();
      this.views.clear();
      this.npcs.clear();
      this.closeDialogue();
      // the scene clock stops with the scene, so the flicker goes with it
      this.hearth = undefined;
      this.structures = undefined;
      this.scenery = undefined;
      this.torchPool = undefined;
    });
  }

  update(): void {
    this.sendMovementIntent();
    this.easeTowardServerPositions();
    this.offerConversation();
    this.carryTheTorch();
  }

  /**
   * Keeps the pool on the delver rather than on the camera.
   *
   * The overlay is camera-fixed, so it is positioned in SCREEN space: the
   * delver's world position minus the camera scroll. That matters because the
   * camera lerps and is clamped by setBounds, so its centre is not the delver's
   * position while they are moving or standing at a map edge — the two moments a
   * torch sitting at the centre reads as "the screen is dim" rather than "I am
   * carrying a light".
   */
  private carryTheTorch(): void {
    const torch = this.torchPool;
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;

    if (!torch?.scene || !self) return;

    const cam = this.cameras.main;
    torch.setPosition(self.sprite.x - cam.scrollX, self.sprite.y - cam.scrollY);
  }

  /**
   * Opens a dialogue when the delver is standing close enough and presses to
   * talk. Walking past never does anything: joining the queue takes a choice,
   * not a collision. FS-0008 §Requirements 24.
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

    for (const { state, sprite } of this.npcs.values()) {
      const distance = Phaser.Math.Distance.Between(
        self.sprite.x,
        self.sprite.y,
        sprite.x,
        sprite.y,
      );

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
  private easeTowardServerPositions(): void {
    for (const { sprite, target } of this.npcs.values()) {
      sprite.x = Phaser.Math.Linear(sprite.x, target.x, POSITION_LERP);
      sprite.y = Phaser.Math.Linear(sprite.y, target.y, POSITION_LERP);
    }

    for (const view of this.views.values()) {
      const { sprite, target } = view;

      sprite.x = Phaser.Math.Linear(sprite.x, target.x, POSITION_LERP);
      sprite.y = Phaser.Math.Linear(sprite.y, target.y, POSITION_LERP);

      // Legs are drawn in world space, so they follow the eased sprite rather
      // than the raw server position.
      drawDelverLegs(
        view.legs,
        sprite.x,
        sprite.y,
        view.facing,
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
    const ground = this.add.graphics();
    ground.fillStyle(BARROW_HEX.charcoal, 1);
    ground.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

    ground.lineStyle(4, BARROW_HEX.brass, 0.4);
    ground.strokeRect(0, 0, HUB_WIDTH, HUB_HEIGHT);
    ground.setDepth(0);
  }

  /**
   * Trees, grass and a fire.
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

    const scenery = this.add.graphics();
    scenery.setDepth(2);

    // trodden paths, under everything else
    for (const [x, y, w, h] of PATHS) {
      scenery.fillStyle(BARROW_HEX.barrowBrown, 0.22);
      scenery.fillRect(x, y, w, h);
    }

    for (const [x, y] of GRASS) {
      if (blocked(x, y, 22)) continue;

      // A tuft, not three strokes: blades of varied height leaning slightly
      // apart, with a darker back rank so it reads as depth rather than a comb.
      const blades: [number, number, number, number][] = [
        [-14, 0, 4, 11], [-8, -3, 4, 16], [-2, -5, 5, 19],
        [4, -2, 4, 15], [10, 1, 4, 10], [15, -1, 3, 12],
      ];

      scenery.fillStyle(BARROW_HEX.arcaneDeep, 0.55);
      for (const [dx, dy, w, h] of blades) {
        scenery.fillRect(x + dx, y + dy, w, h);
      }

      // the front rank, lighter, shorter, offset
      scenery.fillStyle(BARROW_HEX.arcane, 0.4);
      for (const [dx, dy, w, h] of blades) {
        scenery.fillRect(x + dx + 2, y + dy + 4, w - 1, h - 5);
      }
    }

    for (const [x, y] of TREES) {
      if (blocked(x, y - 10, 46)) continue;

      // roots flaring into the ground, so the trunk sits in the earth rather
      // than on top of it
      scenery.fillStyle(BARROW_HEX.pitch, 0.35);
      scenery.fillEllipse(x, y + 34, 44, 12);

      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
      scenery.fillRect(x - 8, y, 16, 34);
      scenery.fillRect(x - 13, y + 26, 26, 8);
      // the shaded side of the bark
      scenery.fillStyle(BARROW_HEX.pitch, 0.4);
      scenery.fillRect(x + 2, y, 6, 34);
      // two boughs leaving the trunk
      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
      scenery.fillRect(x - 18, y - 2, 12, 5);
      scenery.fillRect(x + 7, y - 8, 12, 5);

      // the crown, built from overlapping masses rather than one disc
      scenery.fillStyle(BARROW_HEX.arcaneDeep, 1);
      scenery.fillCircle(x, y - 14, 32);
      scenery.fillCircle(x - 22, y - 4, 22);
      scenery.fillCircle(x + 21, y - 7, 21);
      scenery.fillCircle(x - 6, y - 36, 22);
      scenery.fillCircle(x + 14, y - 30, 18);

      // light catching the upper left, the way the torch pool falls
      scenery.fillStyle(BARROW_HEX.arcane, 0.45);
      scenery.fillCircle(x - 12, y - 26, 16);
      scenery.fillCircle(x - 2, y - 38, 10);
      scenery.fillStyle(BARROW_HEX.arcane, 0.25);
      scenery.fillCircle(x + 10, y - 18, 12);

      // a few gaps, so the mass is not solid
      scenery.fillStyle(BARROW_HEX.pitch, 0.3);
      scenery.fillCircle(x + 6, y - 6, 6);
      scenery.fillCircle(x - 18, y - 18, 5);
    }

    for (const [x, y, length, horizontal] of FENCES) {
      if (blocked(x, y, 20)) continue;
      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);

      const posts = Math.floor(length / 36);
      for (let i = 0; i <= posts; i++) {
        const px = horizontal ? x + i * 36 : x;
        const py = horizontal ? y : y + i * 36;
        scenery.fillRect(px, py - 16, 5, 22);
      }

      // the rails between them
      scenery.fillStyle(BARROW_HEX.barrowBrown, 1);
      if (horizontal) {
        scenery.fillRect(x, y - 12, length, 3);
        scenery.fillRect(x, y - 4, length, 3);
      }
    }

    for (const [x, y] of CRATES) {
      if (blocked(x, y, 14)) continue;
      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
      scenery.fillRect(x - 11, y - 11, 22, 22);
      scenery.lineStyle(2, BARROW_HEX.barrowBrown, 0.9);
      scenery.strokeRect(x - 11, y - 11, 22, 22);
      scenery.lineBetween(x - 11, y - 11, x + 11, y + 11);
    }

    for (const [x, y] of CARTS) {
      if (blocked(x, y, 26)) continue;
      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
      scenery.fillRect(x - 24, y - 10, 48, 20);
      scenery.fillStyle(BARROW_HEX.barrowBrown, 1);
      scenery.fillRect(x - 24, y - 14, 48, 5);
      // wheels
      scenery.fillStyle(BARROW_HEX.pitch, 1);
      scenery.fillCircle(x - 14, y + 11, 7);
      scenery.fillCircle(x + 14, y + 11, 7);
      scenery.fillStyle(BARROW_HEX.barrowBrown, 1);
      scenery.fillCircle(x - 14, y + 11, 3);
      scenery.fillCircle(x + 14, y + 11, 3);
      // the shaft
      scenery.fillRect(x + 22, y - 2, 20, 4);
    }

    if (!blocked(WELL[0], WELL[1], 22)) {
      const [wx, wy] = WELL;
      scenery.fillStyle(BARROW_HEX.slate, 1);
      scenery.fillCircle(wx, wy, 20);
      scenery.fillStyle(BARROW_HEX.pitch, 1);
      scenery.fillCircle(wx, wy, 13);
      // posts and a roof over it
      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
      scenery.fillRect(wx - 20, wy - 34, 5, 30);
      scenery.fillRect(wx + 15, wy - 34, 5, 30);
      scenery.fillStyle(BARROW_HEX.barrowBrown, 1);
      scenery.fillRect(wx - 26, wy - 40, 52, 8);
    }

    // The awnings are the one place a little colour is honest — a market is
    // meant to catch the eye — so they alternate rather than all matching.
    const awnings = [BARROW_HEX.oxblood, BARROW_HEX.arcaneDeep, BARROW_HEX.barrowBrown];

    STALLS.forEach(([sx, sy], i) => {
      if (blocked(sx, sy, 40)) return;

      scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
      scenery.fillRect(sx - 32, sy - 6, 64, 14);
      scenery.fillRect(sx - 30, sy - 30, 4, 26);
      scenery.fillRect(sx + 26, sy - 30, 4, 26);

      // goods on the counter
      scenery.fillStyle(BARROW_HEX.vellumFaint, 0.7);
      scenery.fillRect(sx - 24, sy - 12, 9, 7);
      scenery.fillRect(sx - 6, sy - 11, 7, 6);
      scenery.fillRect(sx + 12, sy - 13, 10, 8);

      scenery.fillStyle(awnings[i % awnings.length], 0.85);
      scenery.fillRect(sx - 36, sy - 36, 72, 9);
      scenery.fillStyle(BARROW_HEX.vellumFaint, 0.5);
      scenery.fillRect(sx - 36, sy - 30, 72, 3);
    });

    // the fire ring, which does not move
    scenery.fillStyle(BARROW_HEX.slate, 1);
    scenery.fillCircle(HEARTH[0], HEARTH[1], 26);
    scenery.fillStyle(BARROW_HEX.pitch, 1);
    scenery.fillCircle(HEARTH[0], HEARTH[1], 19);
    scenery.fillStyle(BARROW_HEX.barrowDeep, 1);
    scenery.fillRect(HEARTH[0] - 16, HEARTH[1] - 3, 32, 6);
    scenery.fillRect(HEARTH[0] - 3, HEARTH[1] - 16, 6, 32);

    this.scenery = scenery;
    this.hearth = this.add.graphics().setDepth(3);
    this.time.addEvent({ delay: 90, loop: true, callback: () => this.flicker() });
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
    const { vx, vy } = player.direction ?? { vx: 0, vy: 0 };

    view.moving = vx !== 0 || vy !== 0;
    view.walkPhase = view.moving ? view.walkPhase + WALK_STEP : 0;

    const facing = facingFrom(vx, vy, view.facing);
    if (facing === view.facing) return;

    view.facing = facing;
    const body = view.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
    body?.setTexture(textureFor(player.class, facing));
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
    if (this.structures || walls.length === 0) return;

    const stone = this.add.graphics();
    stone.setDepth(5);

    for (const wall of walls) {
      stone.fillStyle(BARROW_HEX.barrowDeep, 1);
      stone.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);

      stone.lineStyle(2, BARROW_HEX.barrowBrown, 0.8);
      stone.strokeRect(wall.position.x, wall.position.y, wall.width, wall.height);
    }

    // Walls carry the building they belong to, so the footprints can be
    // reassembled here rather than being a second list to keep in step with the
    // server's.
    const roofs = this.add.graphics();
    roofs.setDepth(6); // over the walls, under anyone standing in front of them

    for (const footprint of footprintsFrom(walls)) {
      this.roofOver(roofs, footprint);
    }

    // One flag covers both: the walls and their roofs are drawn together.
    this.structures = stone;
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
        // server has moved them since the last tick.
        const facing = facingFrom(
          npc.position.x - existing.target.x,
          npc.position.y - existing.target.y,
          existing.facing,
        );

        existing.target = { x: npc.position.x, y: npc.position.y };

        if (facing !== existing.facing && existing.texture) {
          existing.facing = facing;
          const body = existing.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
          body?.setTexture(`${existing.texture}_${facing}`);
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

      const sprite = this.add.container(npc.position.x, npc.position.y, [body, name]);
      sprite.setDepth(10);

      this.npcs.set(npc.entity_id, {
        state: npc,
        sprite,
        target: { x: npc.position.x, y: npc.position.y },
        facing: "down",
        texture,
      });
    }
  }

  /**
   * A line of who they are, and a choice. Not a dialogue tree: no branching, no
   * memory of what was said. FS-0008 §Requirements 24, §Out of Scope.
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
    if (!isSelf) body.setTint(BARROW_HEX.vellumDark);

    const name = this.add
      .text(0, -PLAYER_RADIUS - 14, player.username, {
        fontFamily: "var(--font-body), serif",
        fontSize: "12px",
        color: "#cdbf9a",
      })
      .setOrigin(0.5);

    const sprite = this.add.container(player.position.x, player.position.y, [
      body,
      name,
    ]);
    sprite.setDepth(10);

    // Beneath the body, so a stride reads as legs under a cloak.
    const legs = this.add.graphics();
    legs.setDepth(9);

    this.views.set(player.entity_id, {
      sprite,
      legs,
      target: { x: player.position.x, y: player.position.y },
      facing: "down",
      walkPhase: 0,
      moving: false,
    });
  }
}
