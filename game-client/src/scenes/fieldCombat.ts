import type * as Phaser from "phaser";
import type { ClientGameState, ProjectileState } from "@/types/gameState";
import { screenToWorld, type Point } from "@/render/iso";
import type { ArtLibrary } from "@/render/art/library";
import type { LightMap } from "@/render/lighting";
import { MonsterRoster, phaserMonsterStage, type MonsterTargeting } from "@/render/creatures";
import { PlayerCombat, type CastButton, type CombatLook, type CombatPort } from "@/render/combat/playerCombat";
import { EffectsRuntime } from "@/render/effects/runtime";
import { HitFeedback, type Tintable } from "@/render/effects/hit";
import { ProjectileFlights } from "@/render/effects/projectile";
import { CHARGE_MS, playCharge, type Charge } from "@/render/effects/charge";
import { playSlash } from "@/render/effects/slash";
import { ARROW_FLIGHT, playArrowRelease } from "@/render/effects/arrow";
import { FIREBALL_FLIGHT, playFireballCast } from "@/render/effects/fireball";
import { cursorCss, cursorSource } from "@/render/cursors";
import { socketManager } from "@/utils/class/SocketManager";

/**
 * A field's fighting (FS-X2F2H §Requirements 56), composed from the pieces the run scene draws
 * with, never a copy of them: the monster roster with its plates and HP bars, the player's strike
 * and class casts ({@link PlayerCombat}), projectiles in flight, the struck-character tint and the
 * effects runtime they play on. The field has no run-only surface: no result card, escape,
 * stairs, floor HUD, die-by-choice or leave-run.
 *
 * The scene hands it each state, each frame and each click; it decides nothing about leaving.
 */

/** What the field's fighting draws with. Built on a Phaser scene by {@link fieldCombatOnScene}. */
export interface FieldCombatParts {
  /** The roster, built around the targeting the field answers clicks with. */
  roster(targeting: MonsterTargeting): MonsterRoster;
  port: CombatPort;
  look: CombatLook;
  projectiles?: Pick<ProjectileFlights, "sync" | "clear">;
  hits?: Pick<HitFeedback, "play" | "clearAll">;
  /** The strike-mark over a living monster, the gauntlet otherwise. */
  cursor(overMonster: boolean): void;
  /** A player's drawn body, by entity id, for the struck tint. */
  bodyOf(entityId: string): Tintable | undefined;
  /** Lets go of everything the effects runtime still plays. */
  clearEffects?(): void;
}

export class FieldCombat {
  readonly monsters: MonsterRoster;
  private readonly combat: PlayerCombat;
  /** This client's player as the last state reported them. */
  private self?: { at: Point; className: string; fallen: boolean };
  /** Each player's last reported health, to tint a struck one. */
  private readonly lastHealth = new Map<string, number>();

  readonly targeting: MonsterTargeting = {
    strike: (monster) => this.strike(monster.entity_id, monster.position),
    hover: (monster) => this.parts.cursor(monster !== null),
  };

  constructor(private readonly parts: FieldCombatParts) {
    this.monsters = parts.roster(this.targeting);
    this.combat = new PlayerCombat(parts.port, parts.look);
  }

  /** One field state: its monsters and projectiles are the whole truth; a struck player tints. */
  sync(state: Pick<ClientGameState, "current_player" | "other_players" | "monsters" | "projectiles">): void {
    this.monsters.sync(state.monsters ?? []);
    this.parts.projectiles?.sync((state.projectiles ?? []) as ProjectileState[]);

    const me = state.current_player;
    this.self = me
      ? {
          at: { x: me.position.x, y: me.position.y },
          className: (me.class || "warrior").toLowerCase(),
          fallen: me.current_health !== undefined && me.current_health <= 0,
        }
      : undefined;

    const present = new Set<string>();
    for (const player of [me, ...(state.other_players ?? [])]) {
      if (!player || player.current_health === undefined) continue;
      present.add(player.entity_id);
      const before = this.lastHealth.get(player.entity_id);
      if (before !== undefined && player.current_health < before) {
        const body = this.parts.bodyOf(player.entity_id);
        if (body) this.parts.hits?.play(body);
      }
      this.lastHealth.set(player.entity_id, player.current_health);
    }
    for (const id of this.lastHealth.keys()) if (!present.has(id)) this.lastHealth.delete(id);
  }

  /** One frame: the monsters ease and animate. */
  update(deltaMs: number): void {
    this.monsters.update(deltaMs);
  }

  /** A click on the ground at world point `target`: the class cast, unless the player has fallen. */
  cast(button: CastButton, target: Point): void {
    if (!this.self || this.self.fallen) return;
    this.combat.cast(button, this.self.className, this.self.at, target);
  }

  /** Everything one visit drew is let go: the next visit starts ready and empty. */
  release(): void {
    this.monsters.sync([]);
    this.parts.projectiles?.clear();
    this.parts.hits?.clearAll();
    this.parts.clearEffects?.();
    this.combat.reset();
    this.self = undefined;
    this.lastHealth.clear();
  }

  /** A click on a living monster: a strike, unless the player has fallen. */
  private strike(entityId: string, them: Point): void {
    if (!this.self || this.self.fallen) return;
    this.combat.strike(this.self.at, entityId, them);
  }
}

/**
 * The field's fighting on a Phaser scene, with the baked cursors, effects and projectile bodies
 * the run uses. `selfAnim` is this client's character animator, for the attack clip; `selfAt` is
 * where the player is drawn, for a charge's dust to follow.
 */
export function fieldCombatOnScene(
  scene: Phaser.Scene,
  art: ArtLibrary,
  lightMap: LightMap,
  hooks: {
    selfAnim(): { attack(now: number, aim?: Point, holdMs?: number): void } | undefined;
    selfAt(): Point | undefined;
    bodyOf(entityId: string): Tintable | undefined;
  },
): FieldCombat {
  const fx = new EffectsRuntime(scene, art, lightMap);
  const source = cursorSource(art, scene.textures);
  const gauntlet = cursorCss("cursor_gauntlet", "default", source);
  const strikeMark = cursorCss("cursor_strike", "crosshair", source);
  scene.input.setDefaultCursor(gauntlet);

  let charge: Charge | undefined;
  const followCharge = () => {
    const at = hooks.selfAt();
    if (charge && at) charge.follow(at);
  };
  scene.events.on("update", followCharge);
  scene.events.once("shutdown", () => scene.events.off("update", followCharge));

  const combat = new FieldCombat({
    roster: (targeting) => new MonsterRoster(phaserMonsterStage(scene), art, targeting),
    port: {
      sendMessage: (action, payload) => socketManager.sendMessage(action, payload),
      later: (ms, fn) => scene.time.delayedCall(ms, fn),
    },
    look: {
      slash: (from, to) => playSlash(fx, "self", from, to),
      dash: (from, to) => {
        charge?.end();
        const playing = playCharge(fx, "self", from, to);
        charge = playing;
        scene.time.delayedCall(CHARGE_MS, () => {
          playing.end();
          if (charge === playing) charge = undefined;
        });
      },
      arrow: (from, to) => playArrowRelease(fx, "self", from, to),
      fireball: (from, to) => playFireballCast(fx, "self", from, to),
      attackClip: (aim, holdMs) => hooks.selfAnim()?.attack(scene.time.now, aim, holdMs),
    },
    projectiles: new ProjectileFlights(scene, art, fx, (type) => (type === "arrow" ? ARROW_FLIGHT : FIREBALL_FLIGHT)),
    hits: new HitFeedback(scene),
    cursor: (over) => scene.input.setDefaultCursor(over ? strikeMark : gauntlet),
    bodyOf: hooks.bodyOf,
    clearEffects: () => {
      charge?.end();
      charge = undefined;
      fx.clearAll();
    },
  });

  // the left click's primary attack, the right's class special, at the world point under the
  // pointer (FS-2325V §0.2, §A.5)
  const onPointer = (pointer: Phaser.Input.Pointer) => {
    const target = screenToWorld(pointer.worldX, pointer.worldY);
    if (pointer.leftButtonDown() || pointer.button === 0) combat.cast("primary", target);
    else if (pointer.rightButtonDown() || pointer.button === 2) combat.cast("special", target);
  };
  scene.input.on("pointerdown", onPointer);
  scene.events.once("shutdown", () => scene.input.off("pointerdown", onPointer));

  return combat;
}
