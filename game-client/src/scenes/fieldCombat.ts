import type * as Phaser from "phaser";
import type { ClientGameState, PlayerState, ProjectileState } from "@/types/gameState";
import { screenToWorld, type Point } from "@/render/iso";
import type { ArtLibrary } from "@/render/art/library";
import type { LightMap } from "@/render/lighting";
import { MonsterRoster, phaserMonsterStage, type MonsterTargeting } from "@/render/creatures";
import { PlayerCombat, type CastButton, type CombatLook, type CombatPort } from "@/render/combat/playerCombat";
import { ClassKitFx } from "@/render/combat/classKitFx";
import { EffectsRuntime } from "@/render/effects/runtime";
import { HitFeedback, type Tintable } from "@/render/effects/hit";
import { ProjectileFlights } from "@/render/effects/projectile";
import { projectileFlightOf } from "@/render/effects/flights";
import { CHARGE_MS, playCharge, type Charge } from "@/render/effects/charge";
import { playSlash } from "@/render/effects/slash";
import { playArrowRelease } from "@/render/effects/arrow";
import { playFireballCast } from "@/render/effects/fireball";
import { playShadowShotRelease } from "@/render/effects/shadowShot";
import { cursorCss, cursorSource } from "@/render/cursors";
import { socketManager } from "@/utils/class/SocketManager";

/**
 * A field's fighting (FS-X2F2H §Requirements 56), composed from the pieces the run scene draws
 * with, never a copy of them: the monster roster with its plates and HP bars, the player's strike,
 * class casts and class kit ({@link PlayerCombat}: the archer's Shadow Shot hold, the Mercenary's
 * cut, riposte and parry), how the kit is drawn ({@link ClassKitFx}), projectiles in flight, the
 * struck-character tint and the effects runtime they play on. The field has no run-only surface:
 * no result card, escape, stairs, floor HUD, die-by-choice or leave-run.
 *
 * The scene hands it each state, each frame and each click; it decides nothing about leaving.
 */

/** Phaser's game events a hold is cancelled on (`Phaser.Core.Events.BLUR`, `HIDDEN`): FS-JTNPR req 15. */
const FOCUS_LOST = ["blur", "hidden"] as const;
/** The pointer button that is the right one. */
const RIGHT_BUTTON = 2;

/** What the field's fighting draws with. Built on a Phaser scene by {@link fieldCombatOnScene}. */
export interface FieldCombatParts {
  /** The roster, built around the targeting the field answers clicks with. */
  roster(targeting: MonsterTargeting): MonsterRoster;
  port: CombatPort;
  look: CombatLook;
  /** How the player's own class kit is drawn, fed each state (FS-MAMHR §G.33–§G.36). */
  kit?: Pick<ClassKitFx, "sync" | "forget">;
  projectiles?: Pick<ProjectileFlights, "sync" | "clear">;
  hits?: Pick<HitFeedback, "play" | "clearAll">;
  /** The strike-mark over a living monster, the gauntlet otherwise. */
  cursor(overMonster: boolean): void;
  /** A player's drawn body, by entity id, for the struck tint. */
  bodyOf(entityId: string): Tintable | undefined;
  /** The pointer button now pressed: an archer's right button is the Shadow Shot hold, never a strike. */
  button?(): number | undefined;
  /** Lets go of everything the effects runtime still plays. */
  clearEffects?(): void;
}

export class FieldCombat {
  readonly monsters: MonsterRoster;
  private readonly combat: PlayerCombat;
  /** This client's player as the last state reported them. */
  private self?: { at: Point; className: string; fallen: boolean };
  /** The same, as the wire carries it: the parry, riposte and resource gates read it. */
  private me?: PlayerState | null;
  /** Each player's last reported health, to tint a struck one. */
  private readonly lastHealth = new Map<string, number>();

  readonly targeting: MonsterTargeting = {
    strike: (monster) => this.strike(monster.entity_id, monster.position),
    hover: (monster) => this.parts.cursor(monster !== null),
  };

  constructor(private readonly parts: FieldCombatParts) {
    this.monsters = parts.roster(this.targeting);
    this.combat = new PlayerCombat(parts.port, parts.look, () => this.me);
  }

  /** Whether an archer is drawing a Shadow Shot: no other click is answered, the keys read released. */
  get aiming(): boolean {
    return this.combat.aiming;
  }

  /** Whether the ability lockout runs: the ability card is grey (FS-8AY7S req 31). */
  get lockedOut(): boolean {
    return this.combat.lockedOut;
  }

  /** One field state: its monsters and projectiles are the whole truth; a struck player tints. */
  sync(state: Pick<ClientGameState, "current_player" | "other_players" | "monsters" | "projectiles">): void {
    this.monsters.sync(state.monsters ?? []);
    this.parts.projectiles?.sync((state.projectiles ?? []) as ProjectileState[]);

    const me = state.current_player;
    this.me = me;
    this.self = me
      ? {
          at: { x: me.position.x, y: me.position.y },
          className: (me.class || "warrior").toLowerCase(),
          fallen: me.current_health !== undefined && me.current_health <= 0,
        }
      : undefined;
    // a fallen player's hold ends the moment the client sees it (FS-JTNPR req 15)
    if (!this.self || this.self.fallen) this.combat.cancelAim();
    // the merc's own stance, parries and armed riposte: never a teammate's (FS-MAMHR §G.38)
    this.parts.kit?.sync(me, this.parts.port.now());

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

  /** The Shadow Shot hold, drawn once a frame from where the archer is drawn (FS-JTNPR req 10, 11). */
  aimFrame(drawnAt: Point | undefined): void {
    this.combat.aimFrame(drawnAt);
  }

  /** The right button let go at world point `target`: a ready hold fires (FS-JTNPR req 13, 14). */
  releaseAim(target: Point): void {
    if (!this.self || this.self.fallen) {
      this.combat.cancelAim();
      return;
    }
    this.combat.releaseAim(this.self.at, target);
  }

  /** Ends a hold with nothing sent and no cooldown started (FS-JTNPR req 15). */
  cancelAim(): void {
    this.combat.cancelAim();
  }

  /** Everything one visit drew is let go: the next visit starts ready and empty. */
  release(): void {
    this.monsters.sync([]);
    this.parts.projectiles?.clear();
    this.parts.hits?.clearAll();
    this.parts.clearEffects?.();
    this.parts.kit?.forget();
    this.combat.reset();
    this.self = undefined;
    this.me = undefined;
    this.lastHealth.clear();
  }

  /** A click on a living monster: a strike, unless the player has fallen. */
  private strike(entityId: string, them: Point): void {
    if (!this.self || this.self.fallen) return;
    this.combat.strike(this.self.at, entityId, them, this.self.className, this.parts.button?.());
  }
}

/**
 * The field's fighting on a Phaser scene, with the baked cursors, effects and projectile bodies
 * the run uses. `selfAnim` is this client's character animator, for the attack clip and the aim;
 * `selfAt` is where the player is drawn, for a charge's dust and the kit's tells to follow.
 */
export function fieldCombatOnScene(
  scene: Phaser.Scene,
  art: ArtLibrary,
  lightMap: LightMap,
  hooks: {
    selfAnim():
      | {
          attack(now: number, aim?: Point, holdMs?: number): void;
          holdAim(aim: Point | undefined): void;
          guard(up: boolean, now: number): void;
        }
      | undefined;
    selfAt(): Point | undefined;
    bodyOf(entityId: string): Tintable | undefined;
    /** Whether a click at this screen point is the open satchel's (a loot) or the gear overlay's, never an attack. */
    takesPointer?(x: number, y: number, primary: boolean): boolean;
    /** The ability lockout started or ended: the ability card redraws (FS-8AY7S req 31). */
    lockout?(): void;
  },
): FieldCombat {
  const fx = new EffectsRuntime(scene, art, lightMap);
  const kit = new ClassKitFx(scene);
  const source = cursorSource(art, scene.textures);
  const gauntlet = cursorCss("cursor_gauntlet", "default", source);
  const strikeMark = cursorCss("cursor_strike", "crosshair", source);
  scene.input.setDefaultCursor(gauntlet);

  // the world point under the cursor now, wherever the camera has moved since it last moved
  const cursorWorld = (): Point => {
    const screen = scene.input.activePointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
    return screenToWorld(screen.x, screen.y);
  };

  let charge: Charge | undefined;

  const combat = new FieldCombat({
    roster: (targeting) => new MonsterRoster(phaserMonsterStage(scene), art, targeting),
    port: {
      sendMessage: (action, payload) => socketManager.sendMessage(action, payload),
      later: (ms, fn) => scene.time.delayedCall(ms, fn),
      now: () => scene.time.now,
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
      cut: (from, to) => kit.playCut(from, to),
      riposte: (from, to) => kit.playRiposte(from, to),
      parry: () => kit.raiseParry(scene.time.now),
      shadowShot: (from, to) => playShadowShotRelease(fx, "self", from, to),
      aim: (from, ready) => {
        const toward = cursorWorld();
        hooks.selfAnim()?.holdAim({ x: toward.x - from.x, y: toward.y - from.y });
        kit.aim(from, toward, ready);
      },
      endAim: () => {
        kit.endAim();
        hooks.selfAnim()?.holdAim(undefined);
      },
      attackClip: (aim, holdMs) => hooks.selfAnim()?.attack(scene.time.now, aim, holdMs),
      lockout: () => hooks.lockout?.(),
    },
    kit,
    projectiles: new ProjectileFlights(scene, art, fx, projectileFlightOf),
    hits: new HitFeedback(scene),
    cursor: (over) => scene.input.setDefaultCursor(over ? strikeMark : gauntlet),
    bodyOf: hooks.bodyOf,
    button: () => scene.input.activePointer?.button,
    clearEffects: () => {
      charge?.end();
      charge = undefined;
      fx.clearAll();
    },
  });

  // each frame: the charge's dust and the kit's tells ride on the drawn body, the merc's guard
  // clip holds while his stance does, and a hold follows the body and the cursor now (FS-MAMHR
  // §C.13, §G.35, FS-JTNPR req 10, 11). Before the scene's own update steps the clip
  const followSelf = () => {
    const at = hooks.selfAt();
    if (!at) return;
    charge?.follow(at);
    kit.follow(at, scene.time.now);
    hooks.selfAnim()?.guard(kit.guarding, scene.time.now);
    combat.aimFrame(at);
  };
  scene.events.on("update", followSelf);

  // the left click's primary attack, the right's class ability, at the world point under the
  // pointer (FS-2325V §0.2, §A.5)
  const onPointer = (pointer: Phaser.Input.Pointer) => {
    // an archer drawing a Shadow Shot answers no other click (FS-JTNPR req 16)
    if (combat.aiming) return;
    // a click on the open satchel is a loot, never an attack (FS-2325V §D.2)
    if (hooks.takesPointer?.(pointer.x, pointer.y, pointer.button === 0)) return;
    const target = screenToWorld(pointer.worldX, pointer.worldY);
    if (pointer.leftButtonDown() || pointer.button === 0) combat.cast("primary", target);
    else if (pointer.rightButtonDown() || pointer.button === RIGHT_BUTTON) combat.cast("special", target);
  };
  // letting go of the right button fires or cancels a hold; a release off the canvas, or the
  // window losing focus, never fires (FS-JTNPR req 14, 15)
  const onRelease = (pointer: Phaser.Input.Pointer) => {
    if (pointer.button === RIGHT_BUTTON) combat.releaseAim(screenToWorld(pointer.worldX, pointer.worldY));
  };
  const onReleaseOutside = (pointer: Phaser.Input.Pointer) => {
    if (pointer.button === RIGHT_BUTTON) combat.cancelAim();
  };
  const onFocusLost = () => combat.cancelAim();
  scene.input.on("pointerdown", onPointer);
  scene.input.on("pointerup", onRelease);
  scene.input.on("pointerupoutside", onReleaseOutside);
  for (const event of FOCUS_LOST) scene.game?.events.on(event, onFocusLost);
  scene.events.once("shutdown", () => {
    scene.events.off("update", followSelf);
    scene.input.off("pointerdown", onPointer);
    scene.input.off("pointerup", onRelease);
    scene.input.off("pointerupoutside", onReleaseOutside);
    for (const event of FOCUS_LOST) scene.game?.events.off(event, onFocusLost);
  });

  return combat;
}
