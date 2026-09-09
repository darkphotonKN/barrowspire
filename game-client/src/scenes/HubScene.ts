import Phaser from "phaser";
import { ActionType } from "@/assets/types/client";
import { socketManager } from "@/utils/class/SocketManager";
import { ClientGameState, PlayerState } from "@/types/gameState";
import { BARROW_HEX } from "@/utils/theme";

const HUB_WIDTH = 2000;
const HUB_HEIGHT = 1000;
const PLAYER_RADIUS = 20;

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

  /** One sprite per player entity, keyed by entity id. */
  private delvers = new Map<string, Phaser.GameObjects.Container>();
  private selfEntityID: string | null = null;

  private unsubscribeState?: () => void;
  private lastSent = { vx: 0, vy: 0 };

  constructor() {
    super({ key: "HubScene" });
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, HUB_WIDTH, HUB_HEIGHT);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);

    this.drawGround();
    this.bindInput();

    this.unsubscribeState = socketManager.onGameStateUpdate((state) =>
      this.renderState(state),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.delvers.clear();
    });
  }

  update(): void {
    this.sendMovementIntent();
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
        const self = this.delvers.get(this.selfEntityID);
        if (self) this.cameras.main.startFollow(self, true, 0.1, 0.1);
      }
    }

    for (const other of state.other_players ?? []) {
      this.placeDelver(other, false);
      present.add(other.entity_id);
    }

    // anyone who left the hub since the last tick
    for (const [entityID, sprite] of this.delvers) {
      if (!present.has(entityID)) {
        sprite.destroy();
        this.delvers.delete(entityID);
      }
    }
  }

  private placeDelver(player: PlayerState, isSelf: boolean): void {
    const existing = this.delvers.get(player.entity_id);

    if (existing) {
      existing.setPosition(player.position.x, player.position.y);
      return;
    }

    const body = this.add.graphics();
    body.fillStyle(isSelf ? BARROW_HEX.amber : BARROW_HEX.vellumDark, 1);
    body.fillCircle(0, 0, PLAYER_RADIUS);

    const name = this.add
      .text(0, -PLAYER_RADIUS - 14, player.username, {
        fontFamily: "var(--font-body), serif",
        fontSize: "12px",
        color: "#cdbf9a",
      })
      .setOrigin(0.5);

    const delver = this.add.container(player.position.x, player.position.y, [
      body,
      name,
    ]);
    delver.setDepth(10);

    this.delvers.set(player.entity_id, delver);
  }
}
