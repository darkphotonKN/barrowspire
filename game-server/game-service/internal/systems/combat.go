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
	tick: cooldown, mana, delivery (a targeted strike, a cone, projectiles, a dash),
	then each hit through the damage formula. Projectile impacts detected earlier
	in the same tick are handed in by the ProjectileSystem and resolved here too.

	The worn uniques that ride on combat resolve here as well, every hit through
	applyHit so a kill they make is credited to the wearer: Gravewarden's Oath
	reflects a monster's strike, the Lantern of the Drowned gives projectiles
	pierce, and Ashwalk Greaves' dash lays a burning trail this pulses.
	FS-4R9M9 §Requirements 34–36.
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
)

type projectileSpec struct {
	kind        string // what the client draws: "arrow", "fireball"
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
	manaCost    int
	cooldown    float64 // seconds
	reach       float64 // px, how far a targeted strike lands
	projectile  projectileSpec
}

const (
	targetedAttackRange = 60.0
	slashRange          = 50.0
	slashHalfCone       = 1.05 // ~60°, a 120° cone
	dashDistance        = 180.0
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
	components.AttackMonsterStrike: {
		delivery: deliverTargeted, damageType: components.DamagePhysical, scaling: scaleNone,
		coefficient: 1, reach: math.Inf(1),
	},
	components.AttackSlash: {
		delivery: deliverCone, damageType: components.DamagePhysical, scaling: scaleStrength,
		coefficient: 1.5, cooldown: 0.25,
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
	components.AttackTripleArrow: {
		delivery: deliverProjectile, damageType: components.DamagePhysical, scaling: scaleAgility,
		coefficient: 1.2, manaCost: 10, cooldown: 0.4,
		projectile: projectileSpec{kind: "arrow", speed: 480, maxDistance: 550, radius: 8, spread: []float64{-0.22, 0, 0.22}},
	},
	components.AttackTripleFireball: {
		delivery: deliverProjectile, damageType: components.DamageMagic, scaling: scaleIntelligence,
		coefficient: 0.9, manaCost: 10, cooldown: 0.4,
		projectile: projectileSpec{kind: "fireball", speed: 360, maxDistance: 500, radius: 12, spread: []float64{-0.26, 0, 0.26}},
	},
	components.AttackDash: {
		delivery: deliverMovement, manaCost: 10, cooldown: 0.4,
	},
}

// skillAliases folds every cast_skill id the client sends onto its attack row.
var skillAliases = map[string]components.AttackKind{
	"slash":              components.AttackSlash,
	"melee_slash":        components.AttackSlash,
	"strike":             components.AttackSlash,
	"arrow":              components.AttackArrow,
	"power_shot":         components.AttackArrow,
	"shoot":              components.AttackArrow,
	"fireball":           components.AttackFireball,
	"triple_arrow":       components.AttackTripleArrow,
	"multishot_arrow":    components.AttackTripleArrow,
	"triple_fireball":    components.AttackTripleFireball,
	"multishot_fireball": components.AttackTripleFireball,
	"dash":               components.AttackDash,
	"sprint":             components.AttackDash,
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

// resolve carries out one intent. A request inside its cooldown, short of mana,
// or (for a targeted attack) with no valid target in range does nothing at all:
// no damage, no mana spent, no cooldown started.
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

	var mana *components.ManaComponent
	if mc, ok := attacker.GetComponent(ecs.ComponentTypeMana); ok {
		mana = mc.(*components.ManaComponent)
		if mana.CurrentMana < spec.manaCost {
			return
		}
	}

	switch spec.delivery {
	case deliverTargeted:
		if !s.strike(attacker, at, intent.TargetEntityID, spec) {
			return
		}
	case deliverCone:
		s.slash(attacker, at, intent.TargetX, intent.TargetY, spec, entities)
	case deliverProjectile:
		s.fire(attacker, at, intent.TargetX, intent.TargetY, spec)
	case deliverMovement:
		fromX, fromY := at.X, at.Y
		dash(at, intent.TargetX, intent.TargetY)
		s.layBurningTrail(attacker, fromX, fromY, at.X, at.Y)
	}

	if mana != nil {
		mana.CurrentMana -= spec.manaCost
	}
	if cooldowns != nil {
		// worn attack speed, already capped, shortens every cooldown
		cooldowns.Remaining[intent.Kind] = spec.cooldown / (1 + float64(wornGear(attacker).AttackSpeedPercent)/100)
	}
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

	s.applyHit(attack, target)
	return true
}

// slash hits every valid target inside the cone, each resolved on its own.
func (s *CombatSystem) slash(attacker *ecs.Entity, at *components.TransformComponent, aimX, aimY float64, spec attackSpec, entities []*ecs.Entity) {
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
		if math.Hypot(dx, dy) > slashRange {
			continue
		}
		if math.Abs(normalizeAngle(math.Atan2(dy, dx)-aim)) > slashHalfCone {
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

func dash(at *components.TransformComponent, aimX, aimY float64) {
	dx, dy := aimX-at.X, aimY-at.Y
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		at.X += dashDistance
		return
	}
	at.X += dx / dist * dashDistance
	at.Y += dy / dist * dashDistance
}

// layBurningTrail lays an Ashwalk Greaves wearer's trail along the path just
// dashed: a magic hit from the wearer at power BasePower + their level,
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
		attack.ScalingStat = statValue(sc.(*components.StatsComponent), spec.scaling)
	}
	critRate := 0.0
	if weapon := wornItem(s.em, attacker, wornWeapon); weapon != nil {
		attack.Power += float64(weapon.AttackPower)
		critRate = weapon.CriticalRate
	}

	// worn gear on top, never written into the character's own stats
	gear := wornGear(attacker)
	attack.ScalingStat += gearStatValue(gear, spec.scaling)
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

func gearStatValue(gear components.GearBonusComponent, scaling scalingStat) int {
	switch scaling {
	case scaleStrength:
		return gear.Strength
	case scaleAgility:
		return gear.Agility
	case scaleIntelligence:
		return gear.Intelligence
	default:
		return 0
	}
}

func statValue(stats *components.StatsComponent, scaling scalingStat) int {
	switch scaling {
	case scaleStrength:
		return stats.Strength
	case scaleAgility:
		return stats.Agility
	case scaleIntelligence:
		return stats.Intelligence
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
