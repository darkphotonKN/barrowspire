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
	// the tower's own dead, in the Spire's rolled mix: new names on the Forest's
	// models, and never rolled in a field (FS-M8CSE §D R17, R21)
	MonsterArchetypeBarrowThrall MonsterArchetype = "barrow_thrall"
	MonsterArchetypeSpireWraith  MonsterArchetype = "spire_wraith"
	// the ghoul's skeleton holding a bow, the first ranged monster: it shoots
	// where every other archetype strikes (FS-B4SG9 §A R2)
	MonsterArchetypeBoneArcher MonsterArchetype = "bone_archer"
	// the bosses: never an elite, at most one of each a floor. The demon is
	// the green one; the blood demon the rarer red one (FS-VHGE7 §A R1)
	MonsterArchetypeDemon      MonsterArchetype = "demon"
	MonsterArchetypeBloodDemon MonsterArchetype = "blood_demon"
	// the boss of a Master Spire's top floor, never rolled anywhere else
	// (FS-M8CSE §E R24, R25)
	MonsterArchetypeDaagon MonsterArchetype = "daagon"
	// field wildlife: the Gentle Meadows' creature, never rolled in the Spire
	// (FS-X2F2H §Requirements 37)
	MonsterArchetypeBoar MonsterArchetype = "boar"
	// the Forlorn Forest's creatures: the zombie by default and the rare ghost,
	// never rolled in the Spire (FS-3QHQZ §Requirements 18)
	MonsterArchetypeZombie MonsterArchetype = "zombie"
	MonsterArchetypeGhost  MonsterArchetype = "ghost"
)

// The Spire's variants past each family's first (FS-C8VM7 §A R3): each its own
// sheet, named in snake case as on the wire. Which family, role and unlock tier
// each has is the roster's data (spireRoster), never read off the constant.
const (
	// the ghoul family
	MonsterArchetypeGhast   MonsterArchetype = "ghast"
	MonsterArchetypeRavener MonsterArchetype = "ravener"
	// the skeleton family, after the Bone Archer
	MonsterArchetypeAshenArcher MonsterArchetype = "ashen_archer"
	MonsterArchetypeWightArcher MonsterArchetype = "wight_archer"
	// the troll family
	MonsterArchetypeCaveTroll  MonsterArchetype = "cave_troll"
	MonsterArchetypeBloodTroll MonsterArchetype = "blood_troll"
	// the thrall family, after the Barrow Thrall
	MonsterArchetypePlagueThrall MonsterArchetype = "plague_thrall"
	MonsterArchetypeBlightborn   MonsterArchetype = "blightborn"
	// the ghost family, after the Spire Wraith
	MonsterArchetypeShade   MonsterArchetype = "shade"
	MonsterArchetypePhantom MonsterArchetype = "phantom"
	MonsterArchetypeBanshee MonsterArchetype = "banshee"
	// the goblin family: each variant a blade look and a blade + shield look,
	// two archetypes of one variant (FS-C8VM7 §A R8)
	MonsterArchetypeGoblin                MonsterArchetype = "goblin"
	MonsterArchetypeGoblinShield          MonsterArchetype = "goblin_shield"
	MonsterArchetypeGoblinCutthroat       MonsterArchetype = "goblin_cutthroat"
	MonsterArchetypeGoblinCutthroatShield MonsterArchetype = "goblin_cutthroat_shield"
	MonsterArchetypeGoblinReaver          MonsterArchetype = "goblin_reaver"
	MonsterArchetypeGoblinReaverShield    MonsterArchetype = "goblin_reaver_shield"
	MonsterArchetypeGoblinWarchief        MonsterArchetype = "goblin_warchief"
	MonsterArchetypeGoblinWarchiefShield  MonsterArchetype = "goblin_warchief_shield"
	// the ogre family
	MonsterArchetypeOgre       MonsterArchetype = "ogre"
	MonsterArchetypeOgreMauler MonsterArchetype = "ogre_mauler"
	MonsterArchetypeOgreTyrant MonsterArchetype = "ogre_tyrant"
	// the dark warrior family
	MonsterArchetypeDarkWarrior MonsterArchetype = "dark_warrior"
	MonsterArchetypeDarkReaper  MonsterArchetype = "dark_reaper"
)

// MonsterAction is what a monster is doing, as the state broadcast names it.
// `attack` covers the wind-up and the strike, a demon's slam included.
// FS-77AB6 §Requirements 32. `claw` is a demon's fire claw, from the tick it
// lands for its show window. FS-VHGE7 §B R24.
type MonsterAction string

const (
	MonsterActionIdle   MonsterAction = "idle"
	MonsterActionMove   MonsterAction = "move"
	MonsterActionAttack MonsterAction = "attack"
	MonsterActionClaw   MonsterAction = "claw"
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

	// Route is the path it follows on a dungeon floor; unused on any other.
	Route Route

	// The archetype's fixed timings and radii, copied from its sheet at spawn.
	// None of them scale with level.
	AttackInterval float64 // seconds between strikes
	WindUp         float64 // seconds from starting a strike to landing it
	AttackRange    float64 // px
	AggroRadius    float64 // px
	LeashRadius    float64 // px

	// The second move, copied from its sheet at spawn (FS-VHGE7 §B R15). With
	// Claw its wind-up strike is the slam, rationed by SlamCooldown, and it
	// claws on the swings between. Without it, none of these apply.
	Claw           bool
	SlamCooldown   float64 // seconds between slams
	SlamMultiplier float64 // the slam's damage over its level damage; 0 is 1
	ClawShowFor    float64 // seconds it reports `claw`, standing, from a claw landing

	// The shot, copied from its sheet at spawn (FS-B4SG9 §A R1). With a
	// ShotProjectileType it is a ranged monster and AttackRange is its shooting
	// range. Without one, none of these apply and it strikes in melee.
	ShotProjectileType string  // what the client draws, as "bone_arrow"
	ShotSpeed          float64 // px/s
	ShotRadius         float64 // px
	ShotMaxFlight      float64 // px

	// Timers, counting down in seconds.
	AttackCooldown        float64
	WindUpRemaining       float64
	SlamCooldownRemaining float64
	ClawShowRemaining     float64
	// CorpseRemaining is how long a dead monster still lies before it is removed.
	CorpseRemaining float64
}

func (m *MonsterComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeEnemy
}

// Route is a monster's path over a dungeon floor's cell grid, to its target or
// to its wander destination (FS-KE075 §D, ADR-0062). Pure data: the
// MonsterAISystem searches and follows it.
type Route struct {
	// Cells are the path's cells, its start cell first and Goal last; empty
	// while it has no path to follow.
	Cells []int
	// Next is the index of the cell whose centre it steers for; len(Cells)
	// once the path is used up.
	Next int
	// Goal is the cell the path was searched to.
	Goal int
	// SearchIn is how long, in seconds, before it may search again: a search
	// sets it to the repath interval (FS-KE075 §D R24).
	SearchIn float64
}
