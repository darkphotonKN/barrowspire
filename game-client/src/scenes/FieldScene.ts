import * as Phaser from "phaser";
import { ActionType, type FieldId } from "@/assets/types/client";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { socketManager } from "@/utils/class/SocketManager";
import type { ClientGameState, GateState, PlayerState, Position, WallState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import { ensureCharacterTextures, type Facing } from "@/utils/characterTextures";
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
import { AMBIENT, LightMap } from "@/render/lighting";
import { MARKER_DEPTH } from "@/render/markers";
import { GroundLayer } from "@/render/world";
import { fieldRefusalCopy } from "./fieldRefusals";
import { gateAt, gateEdges } from "./hubGates";

/**
 * A field world (FS-X2F2H §H): the ground, the player and the others in this pod's channel, the
 * field's keep-out areas and its entrance gate, the road home. Placeholder dressing: slice 9
 * dresses the Meadows, and monsters, combat, piles and the HUD come with later slices, shared with
 * the run scene rather than copied (§Requirements 56).
 *
 * Walking into the entrance gate sends one leave_field and waits for world_entered or a refusal,
 * as the hub does for its own sends (§Requirements 57).
 */

/** Each field's size in world px, as the server builds it (FS-X2F2H §Requirements 51). */
const FIELD_SIZE: Record<FieldId, { width: number; height: number }> = {
  gentle_meadows: { width: 2000, height: 1000 },
  // FS-3QHQZ sets the Forest's own size when it builds the Forest
  forlorn_forest: { width: 2000, height: 1000 },
};

const CAMERA_MARGIN = 120;
const POSITION_LERP = 0.3;
const NAME_GAP = 4;
const NOTICE_Y = 72;
const NOTICE_MS = 3200;

/** What the entrance gate is called on the ground, for a player to walk to. */
const ROAD_HOME = "The road home";

function textureFor(playerClass: string | undefined, facing: Facing): string {
  const known = ["warrior", "mage", "archer"];
  const cls = (playerClass ?? "").toLowerCase();
  return `preview_${known.includes(cls) ? cls : "warrior"}_${facing}`;
}

interface PlayerView {
  sprite: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  pos: Point;
  target: Point;
  facing: Facing8;
  anim: CharacterAnimator;
}

export class FieldScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private lastSent = { vx: 0, vy: 0 };

  private field: FieldId = "gentle_meadows";
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
  private unsubscribeState?: () => void;

  constructor() {
    super({ key: "FieldScene" });
  }

  preload(): void {
    preloadArt(this);
  }

  create(data?: { field?: FieldId }): void {
    this.field = data?.field ?? "gentle_meadows";
    const { width, height } = FIELD_SIZE[this.field] ?? FIELD_SIZE.gentle_meadows;

    const bounds = projectedBounds(width, height, CAMERA_MARGIN);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);

    ensureCharacterTextures(this);
    this.art = registerArt(this);
    this.drawGround(width, height);
    this.bindInput();

    // daylight, no torch-lit dark (FS-X2F2H §Requirements 54; slice 9 tunes it)
    this.lightMap = new LightMap(this, AMBIENT.field);

    this.unsubscribeState = socketManager.onGameStateUpdate((state) => this.renderState(state));
    this.listen();

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
  }

  /** Everything one visit made is let go: Phaser reuses the scene instance for the next. */
  private release(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.release, this);
    this.unsubscribeState?.();
    socketManager.offError(ActionType.LeaveField);
    this.views.clear();
    this.selfEntityID = null;
    this.followedSprite = undefined;
    this.groundDrawn = false;
    this.obstaclesDrawn = false;
    this.entranceDrawn = false;
    this.atEntrance = undefined;
    this.leavingField = false;
    this.lightMap = undefined;
    this.lastSent = { vx: 0, vy: 0 };
  }

  update(time: number, delta: number): void {
    this.sendMovementIntent();
    for (const view of this.views.values()) {
      view.pos.x = Phaser.Math.Linear(view.pos.x, view.target.x, POSITION_LERP);
      view.pos.y = Phaser.Math.Linear(view.pos.y, view.target.y, POSITION_LERP);
      standAt(view.sprite, view.pos, 1);
      const body = view.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
      if (view.anim.baked && body) view.anim.show(body, view.anim.step(view.pos, time, delta, false));
      const s = worldToScreen(view.pos.x, view.pos.y);
      view.name.setPosition(s.x, s.y - (body?.displayHeight ?? 60) - NAME_GAP);
    }
    // the light-map in daylight; the torch rides with the player as in every world
    const self = this.selfEntityID ? this.views.get(this.selfEntityID) : undefined;
    this.lightMap?.carry(self ? { x: self.sprite.x, y: self.sprite.y } : null);
    this.lightMap?.update(time);
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
    }

    this.drawObstacles(state.walls ?? []);
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

  /** Baked ground when the manifest has it; otherwise a placeholder meadow floor. */
  private drawGround(width: number, height: number): void {
    if (this.groundDrawn) return;
    this.groundDrawn = true;
    if (GroundLayer.available(this.art, "field")) {
      new GroundLayer(this, this.art, { width, height, kind: "field" });
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

  /** The field's keep-out areas, server entities like the hub's walls. Placeholder until slice 9. */
  private drawObstacles(walls: readonly WallState[]): void {
    if (this.obstaclesDrawn || walls.length === 0) return;
    this.obstaclesDrawn = true;
    const plane = addWorldPlane(this);
    plane.root.setDepth(1);
    const shapes = this.add.graphics();
    shapes.fillStyle(BARROW_HEX.barrowDeep, 0.9);
    for (const wall of walls) shapes.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);
    plane.surface.add(shapes);
  }

  /** The road home: its reach on the ground, and its name, amber for a place to walk into. */
  private drawEntrance(gates: readonly GateState[]): void {
    const road = gates.find((gate) => gate.destination === "hub");
    if (this.entranceDrawn || !road) return;
    this.entranceDrawn = true;
    const plane = addWorldPlane(this);
    plane.root.setDepth(1);
    const reach = this.add.graphics();
    reach.lineStyle(3, BARROW_HEX.amber, 0.6);
    reach.strokeCircle(road.position.x, road.position.y, road.range);
    plane.surface.add(reach);

    const at = worldToScreen(road.position.x, road.position.y);
    this.add
      .text(at.x, at.y - 40, ROAD_HOME, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.markerGate),
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);
  }

  private placePlayer(player: PlayerState, isSelf: boolean): void {
    const existing = this.views.get(player.entity_id);
    if (existing) {
      existing.target = { x: player.position.x, y: player.position.y };
      const { vx, vy } = player.direction ?? { vx: 0, vy: 0 };
      existing.facing = facingFrom(vx, vy, existing.facing);
      if (!existing.anim.baked) {
        const body = existing.sprite.getByName("body") as Phaser.GameObjects.Sprite | null;
        body?.setTexture(textureFor(player.class, nearestScreenFacing(existing.facing)));
      }
      return;
    }

    const body = this.add.sprite(0, 0, textureFor(player.class, "down"));
    body.setName("body");
    const anim = new CharacterAnimator(this.art, player.class);
    if (anim.baked) anim.dress(body);
    else if (!isSelf) body.setTint(BARROW_HEX.vellumDark);

    const name = this.add
      .text(0, 0, player.username, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.markerHub),
      })
      .setOrigin(0.5)
      .setDepth(MARKER_DEPTH.name);

    const pos = { x: player.position.x, y: player.position.y };
    const sprite = this.add.container(0, 0, [body]);
    standAt(sprite, pos, 1);
    this.views.set(player.entity_id, { sprite, name, pos, target: { ...pos }, facing: "se", anim });
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
