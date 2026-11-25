package game

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	commonconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

type ClassConfig struct {
	Stats  components.StatsComponent
	Combat components.CombatComponent
	Health components.HealthComponent
	// Resource is the class resource the ability spends. FS-8AY7S §Requirements 1–3.
	Resource components.ResourceComponent
	// Ability is the attack row the class's right-click resolves to.
	// FS-8AY7S §Requirements 12.
	Ability components.AttackKind
	// TreeAbility is the attack row the class's key 3 resolves to, once the
	// character holds their tree's tier-3 node. FS-04EEA §A R2.
	TreeAbility components.AttackKind
	Skills      []components.SkillComponent
	// Growth is what each level past the first adds. FS-BDA7X §Requirements 19.
	Growth ClassGrowth
}

// ClassGrowth is a class's per-level gain. Level growth touches only these six
// values; whatever is derived from attributes follows from them.
// FS-BDA7X §Requirements 19.
type ClassGrowth struct {
	Strength, Agility, Intelligence, Vitality int
	MaxHealth                                 int
	// MaxMana grows a mana pool only; stamina and parry charges never grow
	// with level. FS-8AY7S §Requirements 15.
	MaxMana int
}

// CreateMatchProgressEntity makes the run-level entity: match progress, the
// floor the run begins on and its Spire height. It outlives every floor change.
// FS-F6F88 §Requirements 3, FS-M8CSE §A Requirement 3; the endgame test run
// begins above the first (FS-BDRTJ R25).
func CreateMatchProgressEntity(em *ecs.EntityManager, startFloor, spireHeight int) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewMatchProgressComponent())
	entity.AddComponent(components.NewFloorComponent(startFloor, spireHeight))

	return entity
}

type PlayerConfig struct {
	MemberID      uuid.UUID
	CharacterID   uuid.UUID
	Level         int
	Experience    int64
	Class         ClassConfig
	ClassName     string
	Username      string
	X, Y          float64
	SkillName     string
	SkillLevel    int
	CurrentHealth int
	MaxHealth     int
	ItemName      string
	ItemQuantity  int
	Vx, Vy        float64
	ItemIDList    []uuid.UUID
	Escape        bool
	PlayerLoadout *components.EquipmentConfig
	// PassiveRanks is the passive tree ranks the character holds (FS-8RZ51 R31)
	PassiveRanks passivetree.Ranks
	// LoadoutUnknown is set when the stored loadout could not be read, so
	// PlayerLoadout is empty for want of it, not because nothing is stored.
	LoadoutUnknown bool
}

func CreatePlayerEntity(em *ecs.EntityManager, config PlayerConfig) *ecs.Entity {
	entity := em.CreateEntity()

	player := components.NewPlayerComponent(config.MemberID, config.ClassName, config.Username, config.Escape)
	player.CharacterID = config.CharacterID
	player.LoadoutUnknown = config.LoadoutUnknown
	player.SeatedLevel = config.Level
	entity.AddComponent(player)

	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))

	entity.AddComponent(components.NewVelocityComponent(config.Vx, config.Vy, commonconstants.DefaultSpeed))

	entity.AddComponent(components.NewHealthComponent(config.Class.Health.CurrentHealth, config.Class.Health.MaxHealth))
	resource := config.Class.Resource
	entity.AddComponent(&resource)
	entity.AddComponent(components.NewAbilityComponent(config.Class.Ability))
	// the parry stance is server state, so its ability carries it: a mercenary
	// is seated with it down. FS-MAMHR §Requirements 18, 22.
	if config.Class.Ability == components.AttackParry {
		entity.AddComponent(components.NewParryComponent())
	}

	// the class's tree ability and the node granting it; whether it is held
	// is read from the ranks on the body, cast by cast. FS-04EEA §A R2–R3.
	if node, ok := passivetree.AbilityNode(config.ClassName); ok && config.Class.TreeAbility != "" {
		entity.AddComponent(components.NewTreeAbilityComponent(config.Class.TreeAbility, node.ID))
	}

	for _, skill := range config.Class.Skills {
		entity.AddComponent(components.NewSkillComponent(skill.SkillName, skill.Level))
	}

	entity.AddComponent(components.NewCombatComponent(config.Class.Combat.Attack, config.Class.Combat.Defense, config.Class.Combat.AttackRange, config.Class.Combat.AttackSpeed))

	entity.AddComponent(components.NewItemIDListComponent(config.ItemIDList))

	stats := components.NewStatsComponent(config.Class.Stats.Strength, config.Class.Stats.Agility, config.Class.Stats.Vitality, config.Class.Stats.Intelligence)
	stats.Level = max(config.Level, 1)
	stats.Experience = int(config.Experience)
	entity.AddComponent(stats)

	// the ranks held, read by the systems on the body, never the record (FS-8RZ51 R31)
	entity.AddComponent(components.NewPassiveRanksComponent(config.PassiveRanks))
	// and what they add, built at seating from the health and pool above (R24)
	systems.ApplyPassiveBonus(entity)
	// a Sellsword's pool holds 5, seated at 0 as every merc's (FS-E1ZDG §J R34)
	systems.ApplySellswordPool(entity)

	// initialize equipment with loadout
	entity.AddComponent(components.NewEquipmentComponent(config.PlayerLoadout))

	// attacks are requested here and resolved by the CombatSystem on the tick
	entity.AddComponent(components.NewAttackIntentComponent())
	entity.AddComponent(components.NewCooldownComponent())

	return entity
}

type DoorConfig struct {
	X, Y, Width, Height float64
}

func CreateDoorEntity(em *ecs.EntityManager, config DoorConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewDoorComponent(config.Width, config.Height))
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewOpenableComponent(false)) // default closed

	return entity
}

// ContainerConfig places a container: where, and its kind, a chest when it
// names none (FS-1D6BX §Requirements 1).
type ContainerConfig struct {
	X, Y float64
	Kind components.ContainerKind
}

func CreateContainerEntity(em *ecs.EntityManager, config ContainerConfig, itemIDList []uuid.UUID) *ecs.Entity {
	entity := em.CreateEntity()
	containerID := uuid.New()
	kind := config.Kind
	if kind == "" {
		kind = components.ContainerKindChest
	}
	entity.AddComponent(&components.ContainerComponent{ContainerID: containerID, Kind: kind})
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewOpenableComponent(false)) // default false
	entity.AddComponent(components.NewItemIDListComponent(itemIDList))

	return entity
}

// CreateDropPileEntity places a drop pile: a container that is already open and
// already opened, so it never rolls items of its own, holding a slain monster's
// drops. It is taken from like an opened chest, and a floor change clears it
// like any floor entity. FS-4R9M9 §Requirements 46.
func CreateDropPileEntity(em *ecs.EntityManager, x, y float64, itemIDs []uuid.UUID) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.ContainerComponent{ContainerID: uuid.New(), Kind: components.ContainerKindDropPile})
	entity.AddComponent(components.NewTransformComponent(x, y))
	entity.AddComponent(&components.OpenableComponent{IsOpen: true, HasBeenOpened: true})
	entity.AddComponent(components.NewItemIDListComponent(itemIDs))

	return entity
}

// CreateFieldDropPileEntity places a field's drop pile: a run's drop pile,
// reserved for the killer from the moment it lands (uuid.Nil: for nobody).
// The field's tick ages it, ends the reservation and removes it.
// FS-X2F2H §Requirements 33–35.
func CreateFieldDropPileEntity(em *ecs.EntityManager, x, y float64, itemIDs []uuid.UUID, killer uuid.UUID) *ecs.Entity {
	entity := CreateDropPileEntity(em, x, y, itemIDs)
	if cc, ok := entity.GetComponent(ecs.ComponentTypeContainer); ok {
		cc.(*components.ContainerComponent).ReservedFor = killer
	}
	return entity
}

type WallConfig struct {
	X, Y, Width, Height float64
}

func CreateWallEntity(em *ecs.EntityManager, wallConfig WallConfig, houseID uuid.UUID) *ecs.Entity {
	entity := em.CreateEntity()
	wallID := uuid.New()
	entity.AddComponent(components.NewWallComponent(houseID, wallID, wallConfig.Width, wallConfig.Height))
	entity.AddComponent(components.NewTransformComponent(wallConfig.X, wallConfig.Y))
	return entity
}

type ItemConfig struct {
	TemplateID      uuid.UUID
	ItemType        types.ItemType
	Name            string
	AttackPower     int
	CriticalRate    float64
	WeaponType      string
	DefenseRating   int
	MagicResistance int
	ArmorSlot       types.ArmorSlot
	HealingAmount   int
	ManaAmount      int
	BuffDuration    int
	BuyPrice        int
	SellPrice       int
	Description     string
}

func CreateItemEntity(em *ecs.EntityManager, itemconfig types.ItemConfig) *ecs.Entity {
	entity := em.CreateEntity()
	itemComp := components.NewItemComponent(itemconfig.TemplateID, itemconfig.ItemType, itemconfig.Name)

	itemComp.AttackPower = itemconfig.AttackPower
	itemComp.CriticalRate = itemconfig.CriticalRate
	itemComp.WeaponType = itemconfig.WeaponType
	itemComp.DefenseRating = itemconfig.DefenseRating
	itemComp.MagicResistance = itemconfig.MagicResistance
	itemComp.ArmorSlot = itemconfig.ArmorSlot
	itemComp.HealingAmount = itemconfig.HealingAmount
	itemComp.ManaAmount = itemconfig.ManaAmount
	itemComp.BuffDuration = itemconfig.BuffDuration
	itemComp.BuyPrice = itemconfig.BuyPrice
	itemComp.SellPrice = itemconfig.SellPrice
	itemComp.Description = itemconfig.Description
	itemComp.InstanceID = itemconfig.InstanceID
	itemComp.RarityID = itemconfig.RarityID
	itemComp.RequiredLevel = itemconfig.RequiredLevel
	itemComp.RarityCode = itemconfig.RarityCode
	itemComp.ItemLevel = itemconfig.ItemLevel
	itemComp.Affixes = itemconfig.Affixes
	itemComp.UniqueEffectCode = itemconfig.UniqueEffectCode
	itemComp.UniqueEffectText = itemconfig.UniqueEffectText
	itemComp.Unsafe = !itemconfig.Safe

	entity.AddComponent(itemComp)

	return entity
}

type EscapeConfig struct {
	X, Y float64
}

func CreateEscapeDoorEntity(em *ecs.EntityManager, config EscapeConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewEscapeDoorComponent())
	entity.AddComponent(components.NewLockableComponent(true))
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewOpenableComponent(false))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	return entity
}

type SwitchConfig struct {
	X, Y     float64
	SwitchID int
}

func CreateSwitchEntity(em *ecs.EntityManager, config SwitchConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewSwitchComponent(config.SwitchID))
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	return entity

}

type StairsConfig struct {
	X, Y float64
}

// CreateStairsEntity places the way up. It is a floor entity: it carries no
// Player component, so a floor change clears it with the rest of the floor.
func CreateStairsEntity(em *ecs.EntityManager, config StairsConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewStairsComponent())
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	return entity
}

// BarrierConfig places a shut barrier: its rect in px by its top-left corner,
// as a door's, and the floor cells it covers.
type BarrierConfig struct {
	Kind                components.BarrierKind
	X, Y, Width, Height float64
	Cells               []components.Cell
}

// CreateBarrierEntity stands a shut barrier, a gate or a secret door, on its
// cells (FS-5FZ4J §A R4). It is a door to the walk, so its rect blocks every
// body while it is shut, read live; it carries no Interactable, which would
// have the interaction system flip it every tick. A floor entity.
func CreateBarrierEntity(em *ecs.EntityManager, config BarrierConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.BarrierComponent{Kind: config.Kind, Cells: config.Cells})
	entity.AddComponent(components.NewDoorComponent(config.Width, config.Height))
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewOpenableComponent(false))
	return entity
}

// CreateSealEntity makes one of a floor's seals, stage its 1-based place in
// the floor's chain (FS-5FZ4J §B R9). A floor entity with no position.
func CreateSealEntity(em *ecs.EntityManager, kind components.SealKind, stage int) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewSealComponent(kind, stage))
	return entity
}

// SealPieceConfig places one seal piece: whose it is, what, where and on
// which cell; a lever's glyph and turn; whether its first work wakes an
// ambush.
type SealPieceConfig struct {
	Seal  uuid.UUID
	Kind  components.SealPieceKind
	X, Y  float64
	Cell  components.Cell
	Glyph string
	Turn  int
	Wakes bool
}

// CreateSealPieceEntity stands one seal piece, worked by interact (FS-5FZ4J
// §C R15-R16). It has no Openable, so the interaction system never flips it.
func CreateSealPieceEntity(em *ecs.EntityManager, config SealPieceConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.SealPieceComponent{
		Seal:  config.Seal,
		Kind:  config.Kind,
		Cell:  config.Cell,
		Glyph: config.Glyph,
		Turn:  config.Turn,
	})
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	if config.Wakes {
		entity.AddComponent(&components.AmbushComponent{})
	}
	return entity
}

// LorePieceConfig is one lore piece: its kind, the seal a mural tells, where
// it stands and the cell that holds it.
type LorePieceConfig struct {
	Kind  components.LoreKind
	Tells uuid.UUID
	X, Y  float64
	Cell  components.Cell
}

// CreateLorePieceEntity stands a mural or a lore shrine, read by interact; a
// piece of no seal, it wakes nothing (FS-5FZ4J §C R15, §F R39). It has no
// Openable, so the interaction system never flips it.
func CreateLorePieceEntity(em *ecs.EntityManager, config LorePieceConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.LorePieceComponent{Kind: config.Kind, Tells: config.Tells, Cell: config.Cell})
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	return entity
}

// TrapConfig is one trap: its kind, the cell it lies on and that cell's
// centre in px.
type TrapConfig struct {
	Kind components.TrapKind
	Cell components.Cell
	X, Y float64
}

// CreateTrapEntity lays one armed, undetected trap (FS-5FZ4J §D R23-R30). It
// is no interact target. A tripwire carries the one ambush it wakes.
func CreateTrapEntity(em *ecs.EntityManager, config TrapConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.TrapComponent{Kind: config.Kind, Cell: config.Cell, Armed: true})
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(&components.DetectableComponent{Spots: []components.Spot{{X: config.X, Y: config.Y}}})
	if config.Kind == components.TrapTripwire {
		entity.AddComponent(&components.AmbushComponent{})
	}
	return entity
}

// CreateFunctionNPCEntity places an NPC who opens something.
//
// They never move, so they carry no velocity: only who they are, where they
// stand, and how close a delver must be to talk.
func CreateFunctionNPCEntity(em *ecs.EntityManager, npc hubNPC) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewNPCComponent(npc.Name, npc.Function))
	entity.AddComponent(components.NewTransformComponent(npc.X, npc.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.NPCInteractRange))
	return entity
}

// CreateGateEntity places a hub gate.
//
// It never moves and is nobody: no velocity and no NPC component, only where it
// goes, where it stands and how close counts. FS-0XMCP §Requirements 5.
func CreateGateEntity(em *ecs.EntityManager, gate hubGate) *ecs.Entity {
	// a copy, so no two worlds share the map data's arrival point
	var arrival *components.GateArrival
	if gate.Arrival != nil {
		at := *gate.Arrival
		arrival = &at
	}

	entity := em.CreateEntity()
	entity.AddComponent(components.NewGateComponent(gate.Destination, arrival))
	entity.AddComponent(components.NewTransformComponent(gate.X, gate.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.GateRange))
	return entity
}

// CreateFieldEntranceEntity places a field's entrance gate: the road back to
// the hub, a gate like the hub's, with the place's own range and no arrival
// point (the arrival is the place's). FS-X2F2H §Requirements 3, 14.
func CreateFieldEntranceEntity(em *ecs.EntityManager, x, y, gateRange float64) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewGateComponent(components.GateDestinationHub, nil))
	entity.AddComponent(components.NewTransformComponent(x, y))
	entity.AddComponent(components.NewInteractableComponent(gateRange))
	return entity
}

// CreateResidentEntity places an ambient NPC who wanders their quarter.
//
// They carry a velocity, unlike a function NPC, because WanderSystem steers them
// and MovementSystem moves them — the same path a delver travels, so collision
// has one implementation rather than two. They carry no Player component: the
// rules, elimination and broadcast paths all key off that, and a resident is not
// a delver.
func CreateResidentEntity(em *ecs.EntityManager, resident hubResident) *ecs.Entity {
	region := resident.Region

	entity := em.CreateEntity()
	npc := components.NewNPCComponent(resident.Name, components.NPCFunctionNone)
	npc.Wander = &region
	npc.Appearance = resident.Appearance
	entity.AddComponent(npc)
	entity.AddComponent(components.NewTransformComponent(
		region.X+region.W/2,
		region.Y+region.H/2,
	))
	entity.AddComponent(components.NewVelocityComponent(0, 0, commonconstants.NPCWanderSpeed))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.NPCInteractRange))

	return entity
}

// CreateFixedResidentEntity places an ambient NPC who stands at one point.
//
// The resident kind with the quarter left off: function "" and an appearance,
// so the wire carries them exactly as it does a wandering resident, but no wander
// region and no velocity, so WanderSystem skips them and MovementSystem never
// moves them. The innkeeper, the patrons and the smith. FS-B0H2D §Requirements 16.
func CreateFixedResidentEntity(em *ecs.EntityManager, resident hubFixedResident) *ecs.Entity {
	entity := em.CreateEntity()
	npc := components.NewNPCComponent(resident.Name, components.NPCFunctionNone)
	npc.Appearance = resident.Appearance
	entity.AddComponent(npc)
	entity.AddComponent(components.NewTransformComponent(resident.X, resident.Y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.NPCInteractRange))

	return entity
}

// MonsterConfig is one monster to place: what it is and where it stands.
type MonsterConfig struct {
	Archetype components.MonsterArchetype
	Level     int
	Elite     bool
	Boss      bool
	// Name is the display name, elite prefix included; empty means the
	// archetype's own name.
	Name string
	X, Y float64
	// StatFactor scales a field monster's level stats before any promotion
	// (FS-X2F2H §Requirements 29); 0 is a Spire monster's own, unscaled.
	StatFactor float64
	// Champion is a top floor's champion boss: its HP and damage the Demon
	// sheet's at its level, its mitigation its variant's × the champion
	// multiplier (FS-C8VM7 §D R28). Boss is set with it.
	Champion bool
}

// CreateMonsterEntity spawns a monster from its archetype's sheet at its level.
//
// It carries a velocity, standing still, so MovementSystem collides delvers
// with it and moves it as the MonsterAISystem steers it. It carries an attack
// intent, where its strikes wait for the CombatSystem. It carries Health and
// Combat, so the CombatSystem can hit it and mitigate the hit. It carries no
// Player component: a floor change clears every entity that is not a delver, and
// the rules and elimination paths count delvers by that tag alone.
func CreateMonsterEntity(em *ecs.EntityManager, config MonsterConfig) *ecs.Entity {
	sheet := monsterSheets[config.Archetype]
	stats := sheet.statsAt(config.Level)
	if config.StatFactor > 0 {
		stats = stats.scaled(config.StatFactor)
	}
	if config.Champion {
		stats = stats.champion(config.Level)
	}
	if config.Elite {
		stats = stats.elite()
	}

	name := config.Name
	if name == "" {
		name = sheet.Name
	}

	entity := em.CreateEntity()
	entity.AddComponent(&components.MonsterComponent{
		Archetype:      config.Archetype,
		Level:          config.Level,
		Elite:          config.Elite,
		Boss:           config.Boss,
		Champion:       config.Champion,
		Name:           name,
		HomeX:          config.X,
		HomeY:          config.Y,
		Action:         components.MonsterActionIdle,
		FacingX:        0,
		FacingY:        1, // towards the viewer until it has somewhere to look
		AttackInterval: sheet.AttackInterval,
		WindUp:         sheet.WindUp,
		AttackRange:    sheet.AttackRange,
		AggroRadius:    sheet.AggroRadius,
		LeashRadius:    sheet.LeashRadius,
		Claw:           sheet.Moves.Claw,
		SlamCooldown:   sheet.Moves.SlamCooldown,
		SlamMultiplier: sheet.Moves.SlamMultiplier,
		ClawShowFor:    sheet.Moves.ClawShowFor,

		ShotProjectileType: sheet.Shot.ProjectileType,
		ShotSpeed:          sheet.Shot.Speed,
		ShotRadius:         sheet.Shot.Radius,
		ShotMaxFlight:      sheet.Shot.MaxFlight,

		Ability: sheet.Ability,
	})
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewVelocityComponent(0, 0, sheet.MoveSpeed))
	entity.AddComponent(components.NewHealthComponent(stats.HP, stats.HP))

	// damage and mitigation at its level; its reach and timings, in px and
	// seconds, are on the monster component, not in Combat's delver units
	entity.AddComponent(&components.CombatComponent{
		Attack:          stats.Damage,
		Defense:         stats.Defense,
		MagicResistance: stats.MagicResistance,
	})
	// where the MonsterAISystem hands its strikes to the CombatSystem
	entity.AddComponent(components.NewAttackIntentComponent())

	return entity
}
