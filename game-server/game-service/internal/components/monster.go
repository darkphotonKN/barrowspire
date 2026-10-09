package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// MonsterArchetype is what kind of monster it is: picks its stat sheet, and on
// the client its sheet and size tier. FS-77AB6 §Requirements 19.
type MonsterArchetype string

const (
	MonsterArchetypeGhoul MonsterArchetype = "ghoul"
	MonsterArchetypeTroll MonsterArchetype = "troll"
	// the boss: never an elite, at most one a floor
	MonsterArchetypeDemon MonsterArchetype = "demon"
)

// MonsterAction is what a monster is doing, as the state broadcast names it.
// `attack` covers the wind-up and the strike. FS-77AB6 §Requirements 32.
type MonsterAction string

const (
	MonsterActionIdle   MonsterAction = "idle"
	MonsterActionMove   MonsterAction = "move"
	MonsterActionAttack MonsterAction = "attack"
	MonsterActionDead   MonsterAction = "dead"
)

// MonsterComponent marks a run entity as a monster. It rides the declared
// ComponentTypeEnemy tag, the way the NPC tag carries a hub resident. Its health,
// damage, defense and speed live on the Health, Combat and Velocity components
// it is spawned with; this holds the rest of what it is. Pure data: every
// behavior lives in systems. FS-77AB6 §Requirements 18.
//
// A monster never carries a Player component: the floor clear, the rules and the
// elimination paths all key off that tag, and a monster is not a delver.
type MonsterComponent struct {
	Archetype MonsterArchetype
	// Level is fixed at spawn. Delvers levelling mid-run do not re-level it.
	Level int
	Elite bool
	Boss  bool
	// Name is server-authored, elite prefix included and level excluded: every
	// client shows the same one and adds the level itself.
	Name string

	// Home is where it was spawned, the anchor it wanders around and leashes to.
	HomeX, HomeY float64

	// Action is what it is doing now.
	Action MonsterAction
	// FacingX, FacingY is the direction it faces; never zero.
	FacingX, FacingY float64

	// Target is the delver entity it is after, uuid.Nil while it has none.
	Target uuid.UUID
	// LastAttacker is the delver entity that last damaged it, uuid.Nil if none.
	// The CombatSystem sets it on every hit; the MonsterAISystem consumes it on
	// its next tick (retaliating if it has no target) and clears it, so an old
	// hit is never answered twice.
	LastAttacker uuid.UUID
	// Retaliating is set while its target is one it took up for hitting it from
	// beyond the leash radius and it has not yet closed inside that radius of
	// them: until it does, the leash does not apply to them.
	Retaliating bool

	// Wander is its walk around home while it has no target.
	Wander Wandering

	// The archetype's fixed timings and radii, copied from its sheet at spawn.
	// None of them scale with level.
	AttackInterval float64 // seconds between strikes
	WindUp         float64 // seconds from starting a strike to landing it
	AttackRange    float64 // px
	AggroRadius    float64 // px
	LeashRadius    float64 // px

	// Timers, counting down in seconds.
	AttackCooldown  float64
	WindUpRemaining float64
	// CorpseRemaining is how long a dead monster still lies before it is removed.
	CorpseRemaining float64
}

func (m *MonsterComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeEnemy
}
