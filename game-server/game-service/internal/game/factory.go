package game

import (
	commonconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

type ClassConfig struct {
	Stats  components.StatsComponent
	Combat components.CombatComponent
	Health components.HealthComponent
	Mana   components.ManaComponent
	Skills []components.SkillComponent
	// Growth is what each level past the first adds. FS-BDA7X §Requirements 19.
	Growth ClassGrowth
}

// ClassGrowth is a class's per-level gain. Level growth touches only these six
// values; whatever is derived from attributes follows from them.
// FS-BDA7X §Requirements 19.
type ClassGrowth struct {
	Strength, Agility, Intelligence, Vitality int
	MaxHealth, MaxMana                        int
}

type MatchConfig struct {
	players []*ecs.Entity
}

// CreateMatchProgressEntity makes the run-level entity: match progress and the
// floor the run is on. It outlives every floor change. FS-F6F88 §Requirements 3.
func CreateMatchProgressEntity(em *ecs.EntityManager) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewMatchProgressComponent())
	entity.AddComponent(components.NewFloorComponent(firstFloor, commonconstants.RunFloorCount))

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
}

func CreatePlayerEntity(em *ecs.EntityManager, config PlayerConfig) *ecs.Entity {
	entity := em.CreateEntity()

	player := components.NewPlayerComponent(config.MemberID, config.ClassName, config.Username, config.Escape)
	player.CharacterID = config.CharacterID
	entity.AddComponent(player)

	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))

	entity.AddComponent(components.NewVelocityComponent(config.Vx, config.Vy, commonconstants.DefaultSpeed))

	entity.AddComponent(components.NewHealthComponent(config.Class.Health.CurrentHealth, config.Class.Health.MaxHealth))
	entity.AddComponent(components.NewManaComponent(config.Class.Mana.CurrentMana, config.Class.Mana.MaxMana))

	for _, skill := range config.Class.Skills {
		entity.AddComponent(components.NewSkillComponent(skill.SkillName, skill.Level))
	}

	entity.AddComponent(components.NewCombatComponent(config.Class.Combat.Attack, config.Class.Combat.Defense, config.Class.Combat.AttackRange, config.Class.Combat.AttackSpeed))

	entity.AddComponent(components.NewItemIDListComponent(config.ItemIDList))

	stats := components.NewStatsComponent(config.Class.Stats.Strength, config.Class.Stats.Agility, config.Class.Stats.Vitality, config.Class.Stats.Intelligence)
	stats.Level = max(config.Level, 1)
	stats.Experience = int(config.Experience)
	entity.AddComponent(stats)

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

type ContainerConfig struct {
	X, Y float64
}

func CreateContainerEntity(em *ecs.EntityManager, config ContainerConfig, itemIDList []uuid.UUID) *ecs.Entity {
	entity := em.CreateEntity()
	containerID := uuid.New()
	entity.AddComponent(components.NewContainerComponent(containerID))
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
