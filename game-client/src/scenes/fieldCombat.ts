import type * as Phaser from "phaser";
import type { ClientGameState, PlayerState, ProjectileState, PublicPlayerState } from "@/types/gameState";
import { screenToWorld, type Point } from "@/render/iso";
import type { ArtLibrary } from "@/render/art/library";
import { onDemandArt } from "@/render/art/phaser";
import type { Swing } from "@/render/art/character";
import type { LightMap } from "@/render/lighting";
import { MonsterRoster, phaserMonsterStage, type MonsterEffects, type MonsterTargeting } from "@/render/creatures";
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
import { playArcherShotRelease } from "@/render/effects/heavyShot";
import { playDemonClaw } from "@/render/effects/demonClaw";
import { StunTells } from "@/render/effects/stun";
import { ensurePointerLook } from "@/render/cursors";
import { socketManager } from "@/utils/class/SocketManager";
import { viewport } from "@/render/viewport";
import type { GameplaySoundPlayer } from "@/audio/gameplaySounds";

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
  /** The strike-mark over a living monster, the hand otherwise. */
  cursor(overMonster: boolean): void;
  /** A player's drawn body, by entity id, for the struck tint. */
  bodyOf(entityId: string): Tintable | undefined;
  /** The pointer button now pressed: an archer's right button is the Shadow Shot hold, never a strike. */
  button?(): number | undefined;
  /** Whether the UI scene claimed the press now heard: a monster under the chat window is not struck (FS-TQZ5J § Change: Batch 6, R129). */
  claimed?(): boolean;
  /** Lets go of everything the effects runtime still plays. */
  clearEffects?(): void;
  /** The scene's gameplay sound effects: the player's own wound plays on them (FS-AND39 R3). */
  sounds?: GameplaySoundPlayer;
  /** The stun tell over each stunned monster's head, as on a run floor (FS-04EEA §H R47). */
  stuns?: Pick<StunTells, "show" | "clear">;
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

  /** Whether an archer is aiming Arrow Rain on key 3 (FS-04EEA R38): no click is answered; the archer walks on. */
  get rainAiming(): boolean {
    return this.combat.rainAiming;
  }

  /** Whether the ability lockout runs: the bar's right-click square is grey (FS-Q18Q3 R22). */
  get lockedOut(): boolean {
    return this.combat.lockedOut;
  }

  /**
   * One field state: its monsters and projectiles are the whole truth; a struck player tints, and
   * this client's own wound sounds, never a teammate's (FS-AND39 R3).
   */
  sync(state: Pick<ClientGameState, "current_player" | "other_players" | "monsters" | "projectiles">): void {
    this.monsters.sync(state.monsters ?? []);
    const me = state.current_player;
    // every player standing in this state, own or other: a bolt is drawn by the archer it was
    // likely loosed by (FS-1J1CB §F R41)
    const players = [me, ...(state.other_players ?? [])].filter((p): p is PublicPlayerState => !!p);
    this.parts.projectiles?.sync((state.projectiles ?? []) as ProjectileState[], players);

    this.me = me;
    this.self = me
      ? {
          at: { x: me.position.x, y: me.position.y },
          className: (me.class || "warrior").toLowerCase(),
          fallen: me.current_health !== undefined && me.current_health <= 0,
        }
      : undefined;
    // a fallen player's hold, or Arrow Rain aim, ends the moment the client sees it (FS-JTNPR req 15, FS-04EEA R38)
    if (!this.self || this.self.fallen) this.combat.cancelAim();
    // the merc's own stance, parries and armed riposte: never a teammate's (FS-MAMHR §G.38)
    this.parts.kit?.sync(me, this.parts.port.now());

    const present = new Set<string>();
    for (const player of players) {
      if (player.current_health === undefined) continue;
      present.add(player.entity_id);
      const before = this.lastHealth.get(player.entity_id);
      if (before !== undefined && player.current_health < before) {
        const body = this.parts.bodyOf(player.entity_id);
        if (body) this.parts.hits?.play(body);
        if (player === me) this.parts.sounds?.play("hit_player");
      }
      this.lastHealth.set(player.entity_id, player.current_health);
    }
    for (const id of this.lastHealth.keys()) if (!present.has(id)) this.lastHealth.delete(id);
  }

  /** One frame: the monsters ease and animate, a stunned one under its stun tell. */
  update(deltaMs: number): void {
    this.monsters.update(deltaMs);
    this.parts.stuns?.show(this.monsters.stunned());
  }

  /** A click on the ground at world point `target`: the class cast, unless the player has fallen. */
  cast(button: CastButton, target: Point): void {
    if (!this.self || this.self.fallen) return;
    this.combat.cast(button, this.self.className, this.self.at, target);
  }

  /**
   * Key 3 at world point `target` (FS-04EEA R35–R37): the player's tree ability, unless they have fallen;
   * nothing on a key's auto-repeat (`repeat`). Whether it was sent.
   */
  treeAbility(target: Point, repeat = false): boolean {
    if (!this.self || this.self.fallen) return false;
    return this.combat.treeAbility(this.self.className, this.self.at, target, repeat);
  }

  /**
   * The Shadow Shot hold, drawn once a frame from where the archer is drawn (FS-JTNPR req 10, 11), and an
   * Arrow Rain aim's circle at the world point `cursor` under the cursor now (FS-04EEA R38).
   */
  aimFrame(drawnAt: Point | undefined, cursor?: Point): void {
    this.combat.aimFrame(drawnAt, cursor);
  }

  /**
   * Key 3 let go with the cursor at world point `cursor` (FS-04EEA R38): an Arrow Rain aim casts at its
   * circle's centre, unless the player has fallen, which only cancels. Whether it was sent.
   */
  releaseTreeAbility(cursor: Point): boolean {
    if (!this.self || this.self.fallen) {
      this.combat.cancelAim();
      return false;
    }
    return this.combat.releaseTreeAbility(this.self.className, this.self.at, cursor);
  }

  /** The right button let go at world point `target`: a ready hold fires (FS-JTNPR req 13, 14). */
  releaseAim(target: Point): void {
    if (!this.self || this.self.fallen) {
      this.combat.cancelAim();
      return;
    }
    this.combat.releaseAim(this.self.at, target);
  }

  /** Ends a hold, or an Arrow Rain aim, with nothing sent and no cooldown started (FS-JTNPR req 15, FS-04EEA R38). */
  cancelAim(): void {
    this.combat.cancelAim();
  }

  /** Everything one visit drew is let go: the next visit starts ready and empty. */
  release(): void {
    this.monsters.clear();
    this.parts.stuns?.clear();
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
    if (!this.self || this.self.fallen || this.parts.claimed?.()) return;
    this.combat.strike(this.self.at, entityId, them, this.self.className, this.parts.button?.());
  }
}

/** The world point under `scene`'s cursor now, wherever the camera has moved since it last moved. */
export function cursorWorldOf(scene: Pick<Phaser.Scene, "input" | "cameras">): Point {
  // Phaser types the result as `Vector2 | object`; with no output given it is a Vector2
  const screen = scene.input.activePointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
  return screenToWorld(screen.x, screen.y);
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
          attack(now: number, aim?: Point, swing?: Swing): void;
          holdAim(aim: Point | undefined): void;
          guard(up: boolean, now: number): void;
        }
      | undefined;
    selfAt(): Point | undefined;
    bodyOf(entityId: string): Tintable | undefined;
    /** Whether a click at this screen point is the open satchel's (a loot) or the gear overlay's, never an attack. */
    takesPointer?(x: number, y: number, primary: boolean): boolean;
    /**
     * Whether the UI scene claimed this press (FS-TQZ5J § Change: Batch 6, R129): one on the chat window
     * during a held world press, which Phaser hands on to the field. Never an attack, a cast or a hold.
     */
    pressClaimed?(pointer: Phaser.Input.Pointer | undefined): boolean;
    /** The ability's lockout or the Shadow Shot hold started or ended: the ability bar is judged again (FS-Q18Q3 R40). */
    abilityChanged?(): void;
    /** The scene's gameplay sound effects: hits, the player's wound and abilities (FS-AND39 R2–R4). */
    sounds?: GameplaySoundPlayer;
  },
): FieldCombat {
  const fx = new EffectsRuntime(scene, art, lightMap);
  const kit = new ClassKitFx(scene);
  // the game's one pointer: the hand, pressed under a held left button, the strike-mark over a
  // monster (FS-KYPQ9 §H.2, § Change: The pressed hand)
  const pointer = ensurePointerLook(scene, art);
  pointer?.base("hand");

  const cursorWorld = () => cursorWorldOf(scene);

  let charge: Charge | undefined;

  // what a monster's actions play on the field, as on a run floor (FS-VHGE7 §D R32–33): a
  // demon's fire claw, so one in a field (dev_test_room's) claws with its flame; and a hit's thud
  // (FS-AND39 R2)
  const monsterEffects: MonsterEffects = {
    claw: (monster, at) => playDemonClaw(fx, monster.entity_id, at, monster.facing),
    hit: () => hooks.sounds?.play("hit_monster"),
  };

  const combat = new FieldCombat({
    roster: (targeting) =>
      new MonsterRoster(phaserMonsterStage(scene), art, targeting, monsterEffects, onDemandArt(scene, art)),
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
      // the Shadow Shot's for a Shadow Ranger, the Heavy Shot's for any other archer (FS-1J1CB §F R41)
      shadowShot: (from, to, shadow) => playArcherShotRelease(fx, "self", from, to, shadow),
      aim: (from, ready, shadow) => {
        const toward = cursorWorld();
        hooks.selfAnim()?.holdAim({ x: toward.x - from.x, y: toward.y - from.y });
        kit.aim(from, toward, ready, shadow);
      },
      endAim: () => {
        kit.endAim();
        hooks.selfAnim()?.holdAim(undefined);
      },
      attackClip: (aim, swing) => hooks.selfAnim()?.attack(scene.time.now, aim, swing),
      // key 3's Arrow Rain aim circle, a world effect the field draws (FS-04EEA R38; ADR-0086 2.2); the
      // volleys' `arrowRain` hook is FS-04EEA's effects slice
      rainAim: (centre) => kit.rainAim(centre),
      endRainAim: () => kit.endRainAim(),
      abilityChanged: () => hooks.abilityChanged?.(),
      abilityCast: (ability) => hooks.sounds?.play(ability),
    },
    kit,
    projectiles: new ProjectileFlights(scene, art, fx, projectileFlightOf),
    hits: new HitFeedback(scene),
    stuns: new StunTells(fx),
    cursor: (over) => pointer?.base(over ? "strike" : "hand"),
    bodyOf: hooks.bodyOf,
    button: () => scene.input.activePointer?.button,
    claimed: () => hooks.pressClaimed?.(scene.input.activePointer) ?? false,
    clearEffects: () => {
      charge?.end();
      charge = undefined;
      fx.clearAll();
    },
    sounds: hooks.sounds,
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
    combat.aimFrame(at, combat.rainAiming ? cursorWorld() : undefined);
  };
  scene.events.on("update", followSelf);

  // the left click's primary attack, the right's class ability, at the world point under the
  // pointer (FS-2325V §0.2, §A.5)
  const onPointer = (pointer: Phaser.Input.Pointer) => {
    // an archer drawing a Shadow Shot answers no other click (FS-JTNPR req 16)
    if (combat.aiming) return;
    // a press the UI scene claimed is the chat window's (FS-TQZ5J § Change: Batch 6, R129)
    if (hooks.pressClaimed?.(pointer)) return;
    // a click on the open satchel is a loot, never an attack (FS-2325V §D.2)
    // in logical units, as the HUD is laid out; Phaser's pointer.x/y are backing px (FS-ZAJMH R15)
    const at = viewport.toLogical(pointer);
    if (hooks.takesPointer?.(at.x, at.y, pointer.button === 0)) return;
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
