import Phaser from "phaser";
import { ActionType } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
import { ClientGameState, PlayerState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";
import {
  ensureCharacterTextures,
  drawDelverLegs,
  type Facing,
} from "@/utils/characterTextures";

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

    this.unsubscribeState = socketManager.onGameStateUpdate((state) =>
      this.renderState(state),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.views.clear();
    });
  }

  update(): void {
    this.sendMovementIntent();
    this.easeTowardServerPositions();
  }

  /**
   * The server ticks at 30Hz and the screen redraws at 60. Applying broadcast
   * positions directly makes every delver — including your own — teleport twice
   * per three frames, which reads as juddering, and the camera chasing a target
   * that jumps is worse still. So sprites ease toward the last known position
   * instead, the same way the run scene does.
   */
  private easeTowardServerPositions(): void {
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
