package systems

import (
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/*
	CombatSystem is the only code that reduces Health. FS-77AB6 §Requirements 1–11.

	Handlers record attack intents as component data; this resolves them on the
	tick: cooldown, cost, delivery (a targeted strike, a cone, projectiles, a dash),
	then each hit through the damage formula. A dash sets a charge going that the
	MovementSystem carries over the ticks after; this ends it once it is spent or
	stopped, or when a new cast lands. Projectile impacts detected earlier
	in the same tick are handed in by the ProjectileSystem and resolved here too.

	The worn uniques that ride on combat resolve here as well, every hit through
	applyHit so a kill they make is credited to the wearer: Gravewarden's Oath
	reflects a monster's strike, the Lantern of the Drowned gives projectiles
	pierce, and Ashwalk Greaves' dash lays a burning trail this pulses.
	FS-4R9M9 §Requirements 34–36.

	The mercenary's parry stance is server state here too (ADR-0030's
	exception): stances are raised before any strike resolves, and a monster
	strike landing on an open one is negated for a parry charge.
	FS-MAMHR §Requirements 10–21.
*/

// Impact is a projectile reaching a damageable entity, waiting to be resolved.
type Impact struct {
	Attack         components.AttackSnapshot
	TargetEntityID uuid.UUID
}

// KillRecord is one monster's death, produced exactly once, by the hit that took
// its health to 0. FS-77AB6 §Requirements 28–29. Consumers (experience, drops)
// read it in the same run; nothing about it is persisted or published here.
type KillRecord struct {
	MonsterEntityID uuid.UUID
	Archetype       components.MonsterArchetype
	Level           int
	Elite           bool
	Boss            bool
	// KillerMemberID is the delver whose hit took it to 0, credited even when
	// that delver died, escaped or left before a projectile of theirs landed.
	KillerMemberID uuid.UUID
	// X, Y is where it died: where its corpse lies and its drops land.
	X, Y float64
	// Floor is the depth it died on; 1 where the world keeps no floors.
	Floor int
}

// PlayerDamage is the run-level switch for delvers damaging delvers, fixed when
// the world is built and never sent by a client. It is off by default: co-op runs
// have no player-versus-player damage. The code paths are kept behind it, not
// deleted, so switching it on restores them through the same formula. FS-77AB6
// §Requirements 12.
type PlayerDamage bool

const (
	PlayerDamageOff PlayerDamage = false
	PlayerDamageOn  PlayerDamage = true
)

type CombatSystem struct {
	em *ecs.EntityManager
	// roll draws uniformly from [0, 1) for crits; injected so tests can pin it
	roll         func() float64
	playerDamage PlayerDamage
	effects      UniqueEffectTuning

	// per-tick scratch: the floor this tick resolves on, and the kills it made
	floor int
	kills []KillRecord
}

func NewCombatSystem(em *ecs.EntityManager, roll func() float64, playerDamage PlayerDamage, effects UniqueEffectTuning) *CombatSystem {
	return &CombatSystem{em: em, roll: roll, playerDamage: playerDamage, effects: effects}
}

type delivery int

const (
	deliverTargeted delivery = iota
	deliverCone
	deliverProjectile
	deliverMovement
)

type scalingStat int

const (
	scaleNone scalingStat = iota
	scaleStrength
	scaleAgility
	scaleIntelligence
	// scaleStrengthAgility scales on the mean of Strength and Agility, its
	// half kept. FS-MAMHR §Requirements 7.
	scaleStrengthAgility
)

type projectileSpec struct {
	kind        string // what the client draws: "arrow", "fireball", "shadow_shot"
	speed       float64
	maxDistance float64
	radius      float64
	spread      []float64 // angle offsets from the aim, one projectile each
}

type attackSpec struct {
	delivery    delivery
	damageType  components.DamageType
	scaling     scalingStat
	coefficient float64
	// cost is paid from the caster's own class resource, whatever its kind.
	// FS-8AY7S §Requirements 8–10.
	cost       int
	cooldown   float64 // seconds
	reach      float64 // px, how far a targeted strike or a cone lands
	halfArc    float64 // radians either side of the aim a cone sweeps
	projectile projectileSpec
	// parriable: an open parry stance on the target negates it.
	// FS-MAMHR §Requirements 14.
	parriable bool
}

const (
	targetedAttackRange = 60.0
	slashRange          = 50.0
	slashHalfCone       = 1.05 // ~60°, a 120° cone
	// the cut: narrower and a little longer than the slash. FS-MAMHR §Requirements 6.
	cutRange    = 55.0
	cutHalfCone = 35 * math.Pi / 180 // a 70° cone
	// the riposte: a wide, long cleave toward the cursor, paid with every parry
	// charge the merc can hold. Charter defaults. FS-MAMHR §Requirements 23.
	riposteRange        = 90.0
	riposteHalfCone     = 120 * math.Pi / 180 // a 240° cone
	riposteParryCharges = 3

	// The charge runs dashDistance at dashSpeed: 0.4 s, 12 ticks of 15 px at
	// the world's 30 per second. The distance is the old teleport's. Under the
	// fastest capped cooldown (0.4 s / 1.5 = 0.267 s) a charge can be recast
	// before it is over: the new cast stops the old one where the body stands
	// and starts afresh, so no cast ever carries anyone more than dashDistance.
	dashDistance = 180.0
	dashSpeed    = 450.0 // px per second
	// dashEpsilon absorbs the float drift of summing steps, so a charge whose
	// last step lands it on its distance is over on that tick.
	dashEpsilon = 1e-6

	// The parry stance: open for parryWindow from its opening tick; one that
	// closes having negated nothing locks the stance out for parryLockout from
	// its close. Charter defaults. FS-MAMHR §Requirements 11, 15.
	parryWindow  = 0.25 // seconds
	parryLockout = 1.0  // seconds
	// parryEpsilon absorbs the float drift of summing tick lengths, so a window
	// on 1/60 s ticks covers exactly the ticks within 0.25 s of its opening.
	parryEpsilon = 1e-9
)

// attackTable is FS-77AB6 §Requirements 6. Starting values. Projectile speed,
// range, radius and spread are what they were before the CombatSystem existed.
//
// Slash's coefficient is 1.5, not the table's 1.0: the FS tunes coefficients so a
// level-1 unequipped delver deals roughly today's numbers, and a warrior slash at
// 1.0 lands 16.8 against the old 25 (outside the ±20% acceptance band). At 1.5 it
// lands 25.2.
var attackTable = map[components.AttackKind]attackSpec{
	components.AttackTargeted: {
		delivery: deliverTargeted, damageType: components.DamagePhysical, scaling: scaleStrength,
		coefficient: 0.5, cooldown: 0.5, reach: targetedAttackRange,
	},
	// a monster's strike is its damage at level, as is: no coefficient, no stat
	// (§Requirements 5). The MonsterAISystem paces it and measures its reach
	// (range × 1.25) as the wind-up ends, so it has no cooldown or reach here.
	// Every monster's strike is parriable, elites' and the boss's included.
	components.AttackMonsterStrike: {
		delivery: deliverTargeted, damageType: components.DamagePhysical, scaling: scaleNone,
		coefficient: 1, reach: math.Inf(1), parriable: true,
	},
	components.AttackSlash: {
		delivery: deliverCone, damageType: components.DamagePhysical, scaling: scaleStrength,
		coefficient: 1.5, cooldown: 0.25, reach: slashRange, halfArc: slashHalfCone,
	},
	// the mercenary's left-click: a narrow, heavy sword cut on Strength and
	// Agility together. FS-MAMHR §Requirements 6–8.
	components.AttackCut: {
		delivery: deliverCone, damageType: components.DamagePhysical, scaling: scaleStrengthAgility,
		coefficient: 1.8, cooldown: 0.25, reach: cutRange, halfArc: cutHalfCone,
	},
	// the cut a merc throws at 3 parry charges, spending them all. No skill id
	// maps to it: armCut swaps it in for a resolving cut, and its 0.25 s starts
	// in the cut's cooldown slot. FS-MAMHR §Requirements 23–25.
	components.AttackRiposte: {
		delivery: deliverCone, damageType: components.DamagePhysical, scaling: scaleStrengthAgility,
		coefficient: 3.0, cost: riposteParryCharges, cooldown: 0.25, reach: riposteRange, halfArc: riposteHalfCone,
	},
	components.AttackArrow: {
		delivery: deliverProjectile, damageType: components.DamagePhysical, scaling: scaleAgility,
		coefficient: 1.4, cooldown: 0.25,
		projectile: projectileSpec{kind: "arrow", speed: 480, maxDistance: 550, radius: 8, spread: []float64{0}},
	},
	components.AttackFireball: {
		delivery: deliverProjectile, damageType: components.DamageMagic, scaling: scaleIntelligence,
		coefficient: 1.1, cooldown: 0.25,
		projectile: projectileSpec{kind: "fireball", speed: 350, maxDistance: 500, radius: 12, spread: []float64{0}},
	},
	// the archer's ability: one slow, heavy bolt, paid in stamina. 90 of the
	// archer's 100 nearly drains it, so the next waits on regen. FS-JTNPR
	// §Requirements 1, 5 (amended 2026-10-30).
	components.AttackShadowShot: {
		delivery: deliverProjectile, damageType: components.DamagePhysical, scaling: scaleAgility,
		coefficient: 3.2, cost: 90, cooldown: 1.2,
		projectile: projectileSpec{kind: "shadow_shot", speed: 260, maxDistance: 650, radius: 10, spread: []float64{0}},
	},
	components.AttackTripleFireball: {
		delivery: deliverProjectile, damageType: components.DamageMagic, scaling: scaleIntelligence,
		coefficient: 0.9, cost: 15, cooldown: 0.4,
		projectile: projectileSpec{kind: "fireball", speed: 360, maxDistance: 500, radius: 12, spread: []float64{-0.26, 0, 0.26}},
	},
	components.AttackDash: {
		delivery: deliverMovement, cost: 25, cooldown: 0.4,
	},
}

// AttackCost is what one resolved cast of an attack row costs its caster's
// class resource; 0 for a row that costs nothing or does not exist.
// FS-8AY7S §Requirements 9, 12.
func AttackCost(kind components.AttackKind) int {
	return attackTable[kind].cost
}

// skillAliases folds every cast_skill id the client sends onto its attack row.
var skillAliases = map[string]components.AttackKind{
	"slash":              components.AttackSlash,
	"melee_slash":        components.AttackSlash,
	"strike":             components.AttackSlash,
	"cut":                components.AttackCut,
	"arrow":              components.AttackArrow,
	"power_shot":         components.AttackArrow,
	"shoot":              components.AttackArrow,
	"fireball":           components.AttackFireball,
	"shadow_shot":        components.AttackShadowShot,
	"triple_fireball":    components.AttackTripleFireball,
	"multishot_fireball": components.AttackTripleFireball,
	"dash":               components.AttackDash,
	"sprint":             components.AttackDash,
	"parry":              components.AttackParry,
}

// SkillAttackKind names the attack a cast_skill id asks for, false when unknown.
func SkillAttackKind(skillID string) (components.AttackKind, bool) {
	kind, ok := skillAliases[skillID]
	return kind, ok
}

// NOTE: this runs every game tick
//
// Update resolves this tick's projectile impacts and attack intents, and returns
// a kill record for every monster a hit took to 0 on it, in resolution order.
func (s *CombatSystem) Update(deltaTime float64, entities []*ecs.Entity, impacts []Impact) []KillRecord {
	s.kills = nil
	s.floor = 1
	if floor, ok := CurrentFloor(entities); ok {
		s.floor = floor.Depth
	}

	for _, impact := range impacts {
		if target, ok := s.em.GetEntity(impact.TargetEntityID); ok {
			s.applyHit(impact.Attack, target)
		}
	}

	for _, entity := range entities {
		if tc, ok := entity.GetComponent(ecs.ComponentTypeBurningTrail); ok {
			s.burn(entity, tc.(*components.BurningTrailComponent), deltaTime, entities)
		}
	}

	// after the burn, so a trail a charge lays as it ends first burns next tick
	for _, entity := range entities {
		s.settleCharge(entity)
	}

	// every stance before any strike, so a parry cast and a strike on the same
	// tick resolve with the stance open, whatever the entity order.
	// FS-MAMHR §Requirements 12
	for _, entity := range entities {
		stepStance(entity, deltaTime)
	}

	for _, entity := range entities {
		tickCooldowns(entity, deltaTime)

		ic, ok := entity.GetComponent(ecs.ComponentTypeAttackIntent)
		if !ok {
			continue
		}
		intents := ic.(*components.AttackIntentComponent)
		pending := intents.Pending
		intents.Pending = nil

		// a dead or resolved attacker is out of play: what it queued is dropped
		if !canAct(entity) {
			continue
		}

		for _, intent := range pending {
			s.resolve(entity, intent, entities)
		}
	}

	kills := s.kills
	s.kills = nil
	return kills
}

func tickCooldowns(entity *ecs.Entity, deltaTime float64) {
	cc, ok := entity.GetComponent(ecs.ComponentTypeCooldown)
	if !ok {
		return
	}
	cooldowns := cc.(*components.CooldownComponent)

	for kind, remaining := range cooldowns.Remaining {
		if remaining-deltaTime <= 0 {
			delete(cooldowns.Remaining, kind)
			continue
		}
		cooldowns.Remaining[kind] = remaining - deltaTime
	}
}

// resolve carries out one intent. A request inside its cooldown, short of its
// cost, or (for a targeted attack) with no valid target in range does nothing
// at all: no damage, nothing spent, no cooldown started. FS-8AY7S §Requirements 10.
func (s *CombatSystem) resolve(attacker *ecs.Entity, intent components.AttackIntent, entities []*ecs.Entity) {
	spec, ok := attackTable[intent.Kind]
	if !ok {
		return
	}

	tc, ok := attacker.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return
	}
	at := tc.(*components.TransformComponent)

	var cooldowns *components.CooldownComponent
	if cc, ok := attacker.GetComponent(ecs.ComponentTypeCooldown); ok {
		cooldowns = cc.(*components.CooldownComponent)
		if cooldowns.Remaining[intent.Kind] > 0 {
			return
		}
	}

	var pool *components.ResourceComponent
	if rc, ok := attacker.GetComponent(ecs.ComponentTypeResource); ok {
		pool = rc.(*components.ResourceComponent)
		spec = armCut(intent.Kind, pool, spec)
		if pool.Current < spec.cost {
			return
		}
	}

	switch spec.delivery {
	case deliverTargeted:
		if !s.strike(attacker, at, intent.TargetEntityID, spec) {
			return
		}
	case deliverCone:
		s.cone(attacker, at, intent.TargetX, intent.TargetY, spec, entities)
	case deliverProjectile:
		s.fire(attacker, at, intent.TargetX, intent.TargetY, spec)
	}

	// a new cast stops a charge in flight where the body stands; a new dash then
	// starts afresh from there, never adding on what the old one had left
	s.endCharge(attacker)
	if spec.delivery == deliverMovement {
		startCharge(attacker, at, intent.TargetX, intent.TargetY)
	}

	if pool != nil {
		pool.Current -= spec.cost
	}
	if cooldowns != nil {
		// worn attack speed, already capped, shortens every cooldown
		cooldowns.Remaining[intent.Kind] = spec.cooldown / (1 + float64(wornGear(attacker).AttackSpeedPercent)/100)
	}
}

// armCut is the row a cut that passed its cooldown resolves as: the riposte
// when the caster holds 3 parry charges, else the cut as it is. Its cost then
// spends all 3, whether or not it hits anything; the cooldown it starts stays
// the cut's slot. Any other attack, or any other resource, is left alone.
// FS-MAMHR §Requirements 23–25.
func armCut(kind components.AttackKind, pool *components.ResourceComponent, spec attackSpec) attackSpec {
	if kind != components.AttackCut || pool.Kind != components.ResourceParryCharges || pool.Current < riposteParryCharges {
		return spec
	}
	return attackTable[components.AttackRiposte]
}

// strike lands a targeted attack, reporting false when there was nothing in
// range to swing at.
func (s *CombatSystem) strike(attacker *ecs.Entity, at *components.TransformComponent, targetID uuid.UUID, spec attackSpec) bool {
	if targetID == attacker.ID {
		return false
	}
	target, ok := s.em.GetEntity(targetID)
	if !ok {
		return false
	}
	attack := s.snapshot(attacker, spec)
	if !CanHit(attack, target, s.playerDamage) {
		return false
	}
	tc, ok := target.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return false
	}
	to := tc.(*components.TransformComponent)
	if math.Hypot(to.X-at.X, to.Y-at.Y) > spec.reach {
		return false
	}

	if spec.parriable && parryStrike(target) {
		return true
	}
	s.applyHit(attack, target)
	return true
}

// stepStance steps a mercenary's parry stance by a tick: it runs the window and
// whiff lockout clocks on, then takes their parry casts out of the queue and
// raises the stance for the first one it may. A cast while the stance is open
// or locked out is refused: it neither opens, extends nor restarts anything.
// Anyone else's parry cast is left to resolve, which finds no row for it and
// does nothing. A mercenary out of play keeps their parry state as it is.
// FS-MAMHR §Requirements 10–18.
func stepStance(entity *ecs.Entity, deltaTime float64) {
	pc, ok := entity.GetComponent(ecs.ComponentTypeParry)
	if !ok || !canAct(entity) {
		return
	}
	stance := pc.(*components.ParryComponent)
	runStanceClocks(stance, deltaTime)

	ic, ok := entity.GetComponent(ecs.ComponentTypeAttackIntent)
	if !ok {
		return
	}
	intents := ic.(*components.AttackIntentComponent)
	var rest []components.AttackIntent
	for _, intent := range intents.Pending {
		if intent.Kind != components.AttackParry {
			rest = append(rest, intent)
			continue
		}
		if !stance.Open && stance.LockoutRemaining == 0 {
			stance.Open, stance.OpenFor, stance.Negated = true, 0, false
		}
	}
	intents.Pending = rest
}

// runStanceClocks advances the whiff lockout and an open stance by a tick. A
// stance past its window closes; if it negated nothing, the lockout starts,
// counted from the moment the window ended rather than from this tick.
// FS-MAMHR §Requirements 11, 15.
func runStanceClocks(stance *components.ParryComponent, deltaTime float64) {
	// before the close below, so a lockout started this tick is not shortened twice
	if stance.LockoutRemaining > 0 {
		stance.LockoutRemaining -= deltaTime
		if stance.LockoutRemaining <= parryEpsilon {
			stance.LockoutRemaining = 0
		}
	}

	if !stance.Open {
		return
	}
	stance.OpenFor += deltaTime
	if stance.OpenFor <= parryWindow+parryEpsilon {
		return
	}
	if !stance.Negated {
		stance.LockoutRemaining = parryLockout - (stance.OpenFor - parryWindow)
	}
	stance.Open, stance.OpenFor, stance.Negated = false, 0, false
}

// parryStrike negates a strike landing on the target's open parry stance: no
// damage, no crit roll, so nothing for Gravewarden's Oath to reflect. It grants
// a parry charge up to the cap, counts the parry even at the cap, and leaves
// the stance open. False when the target has no open stance.
// FS-MAMHR §Requirements 14, 19.
func parryStrike(target *ecs.Entity) bool {
	pc, ok := target.GetComponent(ecs.ComponentTypeParry)
	if !ok {
		return false
	}
	stance := pc.(*components.ParryComponent)
	if !stance.Open {
		return false
	}

	stance.Negated = true
	stance.Parries++
	if rc, ok := target.GetComponent(ecs.ComponentTypeResource); ok {
		if parryCharges := rc.(*components.ResourceComponent); parryCharges.Kind == components.ResourceParryCharges {
			parryCharges.Current = min(parryCharges.Current+1, parryCharges.Max)
		}
	}

	slog.Debug("strike parried", "entity_id", target.ID, "parries", stance.Parries)
	return true
}

// cone hits every valid target within the attack's reach and arc around the
// aim, each resolved on its own.
func (s *CombatSystem) cone(attacker *ecs.Entity, at *components.TransformComponent, aimX, aimY float64, spec attackSpec, entities []*ecs.Entity) {
	aim := math.Atan2(aimY-at.Y, aimX-at.X)
	attack := s.snapshot(attacker, spec)

	for _, target := range entities {
		if target.ID == attacker.ID || !CanHit(attack, target, s.playerDamage) {
			continue
		}
		tc, ok := target.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		to := tc.(*components.TransformComponent)

		dx, dy := to.X-at.X, to.Y-at.Y
		if math.Hypot(dx, dy) > spec.reach {
			continue
		}
		if math.Abs(normalizeAngle(math.Atan2(dy, dx)-aim)) > spec.halfArc {
			continue
		}

		s.applyHit(attack, target)
	}
}

// fire spawns the attack's projectiles, each carrying the attacker as they are now.
func (s *CombatSystem) fire(attacker *ecs.Entity, at *components.TransformComponent, aimX, aimY float64, spec attackSpec) {
	aim := math.Atan2(aimY-at.Y, aimX-at.X)
	attack := s.snapshot(attacker, spec)
	p := spec.projectile

	for _, offset := range p.spread {
		angle := aim + offset
		shot := s.em.CreateEntity()
		shot.AddComponent(components.NewTransformComponent(at.X, at.Y))
		shot.AddComponent(components.NewVelocityComponent(math.Cos(angle)*p.speed, math.Sin(angle)*p.speed, p.speed))
		shot.AddComponent(components.NewProjectileComponent(attack, p.speed, p.maxDistance, p.radius, p.kind))
	}
}

// startCharge sets a charge going from where the attacker stands toward the
// aim: +x when the aim is where they stand. The MovementSystem carries it.
func startCharge(attacker *ecs.Entity, at *components.TransformComponent, aimX, aimY float64) {
	dirX, dirY := 1.0, 0.0
	dx, dy := aimX-at.X, aimY-at.Y
	if dist := math.Hypot(dx, dy); dist > 0 {
		dirX, dirY = dx/dist, dy/dist
	}
	attacker.AddComponent(&components.DashComponent{
		DirX: dirX, DirY: dirY,
		Speed:     dashSpeed,
		Remaining: dashDistance,
		FromX:     at.X, FromY: at.Y,
	})
}

// settleCharge ends a charge that is over: one out of play goes at once and
// lays nothing, one spent or stopped ends where it stands.
func (s *CombatSystem) settleCharge(entity *ecs.Entity) {
	dc, ok := entity.GetComponent(ecs.ComponentTypeDash)
	if !ok {
		return
	}
	if !canAct(entity) {
		entity.RemoveComponent(ecs.ComponentTypeDash)
		return
	}
	if dc.(*components.DashComponent).Remaining <= dashEpsilon {
		s.endCharge(entity)
	}
}

// endCharge ends the entity's charge, if one is in flight, where it stands, and
// lays an Ashwalk wearer's trail along the path it actually travelled.
func (s *CombatSystem) endCharge(entity *ecs.Entity) {
	dc, ok := entity.GetComponent(ecs.ComponentTypeDash)
	if !ok {
		return
	}
	entity.RemoveComponent(ecs.ComponentTypeDash)
	tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	if !ok || !canAct(entity) {
		return
	}
	charge := dc.(*components.DashComponent)
	at := tc.(*components.TransformComponent)
	slog.Debug("charge ended",
		"entity_id", entity.ID,
		"travelled", math.Hypot(at.X-charge.FromX, at.Y-charge.FromY),
		"unspent", charge.Remaining,
	)
	s.layBurningTrail(entity, charge.FromX, charge.FromY, at.X, at.Y)
}

// layBurningTrail lays an Ashwalk Greaves wearer's trail along the path just
// dashed, as the charge ends: a magic hit from the wearer at power BasePower + their level,
// coefficient 1, nothing scaling it and no crit. It first burns on the next
// tick. A wearer has one live trail: this one replaces any still burning from
// their last dash. FS-4R9M9 §Requirements 36 (user decision 2026-10-09).
func (s *CombatSystem) layBurningTrail(wearer *ecs.Entity, fromX, fromY, toX, toY float64) {
	if !WornUniqueEffects(s.em, wearer)[types.UniqueEffectBurningDash] {
		return
	}
	tuning := s.effects.BurningTrail
	s.putOutTrailOf(wearer.ID)

	attack := components.AttackSnapshot{
		AttackerEntityID: wearer.ID,
		DamageType:       components.DamageMagic,
		Power:            float64(tuning.BasePower),
		Coefficient:      1,
	}
	if pc, ok := wearer.GetComponent(ecs.ComponentTypePlayer); ok {
		attack.AttackerMemberID = pc.(*components.PlayerComponent).MemberID
	}
	if sc, ok := wearer.GetComponent(ecs.ComponentTypeStats); ok {
		attack.Power += float64(sc.(*components.StatsComponent).Level)
	}

	trail := s.em.CreateEntity()
	trail.AddComponent(&components.BurningTrailComponent{
		Attack: attack,
		FromX:  fromX, FromY: fromY,
		ToX: toX, ToY: toY,
		HalfWidth: tuning.HalfWidth,
		Remaining: tuning.Seconds,
	})
}

// putOutTrailOf removes the wearer's live burning trail, if any.
func (s *CombatSystem) putOutTrailOf(wearerID uuid.UUID) {
	for _, entity := range s.em.GetAllEntities() {
		tc, ok := entity.GetComponent(ecs.ComponentTypeBurningTrail)
		if ok && tc.(*components.BurningTrailComponent).Attack.AttackerEntityID == wearerID {
			s.em.RemoveEntity(entity.ID)
		}
	}
}

// trailEpsilon absorbs the float drift of summing tick lengths, so a 3 s trail
// on 1/60 s ticks pulses at exactly 0, 0.5 … 2.5 s and burns out on its 180th.
const trailEpsilon = 1e-9

// burn advances one burning trail by a tick: on a pulse it hits each monster
// within HalfWidth of the path once, through applyHit, so a kill is credited
// to the wearer. Delvers are never hurt by it. It goes out when it burns out
// or its wearer is no longer in play. FS-4R9M9 §Requirements 36, 38.
func (s *CombatSystem) burn(entity *ecs.Entity, trail *components.BurningTrailComponent, deltaTime float64, entities []*ecs.Entity) {
	wearer, ok := s.em.GetEntity(trail.Attack.AttackerEntityID)
	if !ok || !InPlay(wearer) {
		s.em.RemoveEntity(entity.ID)
		return
	}

	if trail.UntilPulse <= trailEpsilon {
		for _, target := range entities {
			if !target.HasComponent(ecs.ComponentTypeEnemy) {
				continue
			}
			tc, ok := target.GetComponent(ecs.ComponentTypeTransform)
			if !ok {
				continue
			}
			to := tc.(*components.TransformComponent)
			if distanceToSegment(to.X, to.Y, trail.FromX, trail.FromY, trail.ToX, trail.ToY) <= trail.HalfWidth {
				s.applyHit(trail.Attack, target)
			}
		}
		trail.UntilPulse += s.effects.BurningTrail.PulseSeconds
	}

	trail.UntilPulse -= deltaTime
	trail.Remaining -= deltaTime
	if trail.Remaining <= trailEpsilon {
		s.em.RemoveEntity(entity.ID)
	}
}

// distanceToSegment is how far (px, py) lies from the segment (ax, ay)–(bx, by).
func distanceToSegment(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	lengthSquared := dx*dx + dy*dy
	if lengthSquared == 0 {
		return math.Hypot(px-ax, py-ay)
	}
	t := max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/lengthSquared))
	return math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
}

// applyHit resolves one hit against one target. A hit CanHit refuses is
// discarded before the crit roll: one on a dead or resolved target, a monster's
// on a monster, and, with player damage off, a delver's on a delver. A hit on a
// monster records its attacker, and the killing blow records the kill. A
// monster's strike on a Gravewarden wearer is reflected.
func (s *CombatSystem) applyHit(attack components.AttackSnapshot, target *ecs.Entity) {
	if !CanHit(attack, target, s.playerDamage) {
		return
	}
	hc, _ := target.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	mc, targetIsMonster := target.GetComponent(ecs.ComponentTypeEnemy)

	damage, crit := attack.TrueDamage, false
	if damage <= 0 {
		damage, crit = ResolveDamage(attack, s.mitigation(target), s.roll())
	}
	health.CurrentHealth = max(health.CurrentHealth-damage, 0)

	if targetIsMonster {
		monster := mc.(*components.MonsterComponent)
		monster.LastAttacker = attack.AttackerEntityID
		// the hit that took it to 0 is the killing blow; every later one stops
		// at the dead-target check above, so this runs once per monster
		if health.CurrentHealth == 0 {
			s.recordKill(attack, target, monster)
		}
	}

	slog.Debug("hit resolved",
		"attacker_entity_id", attack.AttackerEntityID,
		"target_entity_id", target.ID,
		"damage", damage,
		"crit", crit,
		"remaining_health", health.CurrentHealth,
	)

	if attack.FromMonster {
		s.reflect(attack, target, damage)
	}
}

// reflect answers a monster's strike on a Gravewarden's Oath wearer still in
// play: the striker takes max(1, round(ReflectPercent × the damage dealt)) as an
// unmitigated, non-crit hit from the wearer, through applyHit so a killing blow
// is a kill credited to them. The reflected hit is a delver's, never a
// monster's, so it never reflects in turn; a striker already at 0 is refused by
// CanHit. FS-4R9M9 §Requirements 34, 38.
func (s *CombatSystem) reflect(strike components.AttackSnapshot, wearer *ecs.Entity, damage int) {
	pc, isDelver := wearer.GetComponent(ecs.ComponentTypePlayer)
	if !isDelver || !InPlay(wearer) || !WornUniqueEffects(s.em, wearer)[types.UniqueEffectMeleeReflect] {
		return
	}
	striker, ok := s.em.GetEntity(strike.AttackerEntityID)
	if !ok {
		return
	}

	s.applyHit(components.AttackSnapshot{
		AttackerEntityID: wearer.ID,
		AttackerMemberID: pc.(*components.PlayerComponent).MemberID,
		DamageType:       strike.DamageType,
		TrueDamage:       max(1, int(math.Round(float64(damage)*float64(s.effects.ReflectPercent)/100))),
	}, striker)
}

// recordKill makes the kill record for a monster's killing blow.
func (s *CombatSystem) recordKill(attack components.AttackSnapshot, target *ecs.Entity, monster *components.MonsterComponent) {
	record := KillRecord{
		MonsterEntityID: target.ID,
		Archetype:       monster.Archetype,
		Level:           monster.Level,
		Elite:           monster.Elite,
		Boss:            monster.Boss,
		KillerMemberID:  attack.AttackerMemberID,
		Floor:           s.floor,
	}
	if tc, ok := target.GetComponent(ecs.ComponentTypeTransform); ok {
		transform := tc.(*components.TransformComponent)
		record.X, record.Y = transform.X, transform.Y
	}

	s.kills = append(s.kills, record)
}

// snapshot captures what the attacker brings to this attack right now: class
// attack plus the equipped weapon's attack_power and worn flat damage, the
// scaling stat plus the worn attribute, crit chance from the weapon's
// critical_rate plus worn crit points, and a worn Lantern's pierce.
func (s *CombatSystem) snapshot(attacker *ecs.Entity, spec attackSpec) components.AttackSnapshot {
	attack := components.AttackSnapshot{
		AttackerEntityID: attacker.ID,
		DamageType:       spec.damageType,
		Coefficient:      spec.coefficient,
		CritChance:       CritChance(0),
		FromMonster:      attacker.HasComponent(ecs.ComponentTypeEnemy),
	}

	if pc, ok := attacker.GetComponent(ecs.ComponentTypePlayer); ok {
		attack.AttackerMemberID = pc.(*components.PlayerComponent).MemberID
	}
	if cc, ok := attacker.GetComponent(ecs.ComponentTypeCombat); ok {
		attack.Power = float64(cc.(*components.CombatComponent).Attack)
	}
	if sc, ok := attacker.GetComponent(ecs.ComponentTypeStats); ok {
		stats := sc.(*components.StatsComponent)
		attack.ScalingStat = scalingValue(spec.scaling, stats.Strength, stats.Agility, stats.Intelligence)
	}
	critRate := 0.0
	if weapon := wornItem(s.em, attacker, wornWeapon); weapon != nil {
		attack.Power += float64(weapon.AttackPower)
		critRate = weapon.CriticalRate
	}

	// worn gear on top, never written into the character's own stats
	gear := wornGear(attacker)
	attack.ScalingStat += scalingValue(spec.scaling, gear.Strength, gear.Agility, gear.Intelligence)
	attack.Power += float64(gear.FlatDamage)
	attack.CritChance = CritChance(critRate + float64(gear.CritChance)/100)

	if WornUniqueEffects(s.em, attacker)[types.UniqueEffectPierce] {
		attack.Pierce = s.effects.PierceExtraTargets
	}

	return attack
}

// mitigation is the target's defense (own + Σ armor defense_rating + worn
// defense) and magic resistance (own + Σ armor magic_resistance + worn magic
// resistance), read at the moment of the hit. A delver's own magic resistance
// is 0; a monster's comes from its stat sheet.
func (s *CombatSystem) mitigation(target *ecs.Entity) Mitigation {
	var m Mitigation

	if cc, ok := target.GetComponent(ecs.ComponentTypeCombat); ok {
		combat := cc.(*components.CombatComponent)
		m.Defense = combat.Defense
		m.MagicResistance = combat.MagicResistance
	}

	for _, slot := range armorSlots {
		if armor := wornItem(s.em, target, slot); armor != nil {
			m.Defense += armor.DefenseRating
			m.MagicResistance += armor.MagicResistance
		}
	}

	gear := wornGear(target)
	m.Defense += gear.Defense
	m.MagicResistance += gear.MagicResistance

	return m
}

// wornGear is what the entity's worn gear adds this tick; zero when it has none.
func wornGear(entity *ecs.Entity) components.GearBonusComponent {
	if gc, ok := entity.GetComponent(ecs.ComponentTypeGearBonus); ok {
		return *gc.(*components.GearBonusComponent)
	}
	return components.GearBonusComponent{}
}

// scalingValue is what an attack's scaling reads from one set of attributes,
// the character's own or their worn gear's: one stat as is, or the mean of two
// with its half kept. Own and worn values add, so a hybrid attack scales on
// ((STR + worn STR) + (AGI + worn AGI)) / 2. FS-MAMHR §Requirements 7.
func scalingValue(scaling scalingStat, strength, agility, intelligence int) float64 {
	switch scaling {
	case scaleStrength:
		return float64(strength)
	case scaleAgility:
		return float64(agility)
	case scaleIntelligence:
		return float64(intelligence)
	case scaleStrengthAgility:
		return float64(strength+agility) / 2
	default:
		return 0
	}
}

func alive(entity *ecs.Entity) bool {
	hc, ok := entity.GetComponent(ecs.ComponentTypeHealth)
	return ok && hc.(*components.HealthComponent).CurrentHealth > 0
}

// CanHit reports whether a hit may land on a target at all. A target that is
// dead, or a delver out of play (escaped or left behind), takes nothing.
// Monsters never damage monsters, and with player damage off a delver never
// damages a delver (FS-77AB6 §Requirements 12, 14, 17). A projectile passes
// through whatever this refuses.
func CanHit(attack components.AttackSnapshot, target *ecs.Entity, playerDamage PlayerDamage) bool {
	if !alive(target) {
		return false
	}

	targetIsDelver := target.HasComponent(ecs.ComponentTypePlayer)
	if targetIsDelver && !InPlay(target) {
		return false
	}
	if attack.FromMonster && target.HasComponent(ecs.ComponentTypeEnemy) {
		return false
	}
	fromDelver := attack.AttackerMemberID != uuid.Nil
	if fromDelver && targetIsDelver && playerDamage == PlayerDamageOff {
		return false
	}

	return true
}

// canAct reports whether an entity may still have its attacks resolved: a delver
// while in play, anything else while alive.
func canAct(entity *ecs.Entity) bool {
	if entity.HasComponent(ecs.ComponentTypePlayer) {
		return InPlay(entity)
	}
	return alive(entity)
}

func normalizeAngle(angle float64) float64 {
	for angle > math.Pi {
		angle -= 2 * math.Pi
	}
	for angle < -math.Pi {
		angle += 2 * math.Pi
	}
	return angle
}
