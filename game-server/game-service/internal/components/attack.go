package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// DamageType decides what a hit is mitigated by: defense or magic resistance.
type DamageType string

const (
	DamagePhysical DamageType = "physical"
	DamageMagic    DamageType = "magic"
)

// AttackKind names one row of the attack table, after skill aliases are folded.
type AttackKind string

const (
	AttackTargeted       AttackKind = "attack"
	AttackSlash          AttackKind = "slash"
	AttackArrow          AttackKind = "arrow"
	AttackFireball       AttackKind = "fireball"
	AttackTripleArrow    AttackKind = "triple_arrow"
	AttackTripleFireball AttackKind = "triple_fireball"
	AttackDash           AttackKind = "dash"
	// AttackMonsterStrike is a monster's swing landing at the end of its
	// wind-up. Only the MonsterAISystem records it; no client message maps to it.
	AttackMonsterStrike AttackKind = "monster_strike"
)

// AttackSnapshot is what an attacker brought to a hit, captured when the hit was
// made (or, for a projectile, when it was fired). It outlives the attacker: a
// projectile whose owner has died still resolves with it and still credits them.
type AttackSnapshot struct {
	AttackerEntityID uuid.UUID
	AttackerMemberID uuid.UUID // uuid.Nil when the attacker is not a delver
	DamageType       DamageType
	Power            float64 // class attack + equipped weapon attack_power
	Coefficient      float64
	ScalingStat      int // the attack's scaling stat value at capture
	CritChance       float64
	// FromMonster marks a monster's strike: monsters never damage monsters.
	FromMonster bool
	// Pierce is how many more distinct targets a projectile fired with this
	// can hit after its first (the Lantern of the Drowned). FS-4R9M9 §Requirements 35.
	Pierce int
	// TrueDamage, when above 0, is exactly what the hit deals: unmitigated and
	// never a crit (Gravewarden's Oath's reflected hit). FS-4R9M9 §Requirements 34.
	TrueDamage int
}

// AttackIntent is a request a handler validated and the CombatSystem has yet to
// resolve on the tick.
type AttackIntent struct {
	Kind           AttackKind
	TargetEntityID uuid.UUID // the targeted attack's target
	TargetX        float64   // where an aimed skill points
	TargetY        float64
}

// AttackIntentComponent holds an entity's unresolved attack requests, oldest first.
type AttackIntentComponent struct {
	Pending []AttackIntent
}

func (a *AttackIntentComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeAttackIntent
}

func NewAttackIntentComponent() *AttackIntentComponent {
	return &AttackIntentComponent{}
}

// CooldownComponent is the seconds left before each attack kind can be used again.
type CooldownComponent struct {
	Remaining map[AttackKind]float64
}

func (c *CooldownComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeCooldown
}

func NewCooldownComponent() *CooldownComponent {
	return &CooldownComponent{Remaining: make(map[AttackKind]float64)}
}
