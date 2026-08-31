package game

import (
	"math"

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
}

type MatchConfig struct {
	players []*ecs.Entity
}

func CreateMatchProgressEntity(em *ecs.EntityManager) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewMatchProgressComponent(commonconstants.DefautMaxSessionPlayers))

	return entity
}

type PlayerConfig struct {
	MemberID      uuid.UUID
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
	AttackActive  bool
	HasHit        bool
	Escape        bool
	PlayerLoadout *components.EquipmentConfig
}

func CreatePlayerEntity(em *ecs.EntityManager, config PlayerConfig) *ecs.Entity {
	entity := em.CreateEntity()

	entity.AddComponent(components.NewPlayerComponent(config.MemberID, config.ClassName, config.Username, config.HasHit, config.AttackActive, config.Escape))

	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))

	entity.AddComponent(components.NewVelocityComponent(config.Vx, config.Vy, commonconstants.DefaultSpeed))

	entity.AddComponent(components.NewHealthComponent(config.Class.Health.CurrentHealth, config.Class.Health.MaxHealth))
	entity.AddComponent(components.NewManaComponent(config.Class.Mana.CurrentMana, config.Class.Mana.MaxMana))

	for _, skill := range config.Class.Skills {
		entity.AddComponent(components.NewSkillComponent(skill.SkillName, skill.Level))
	}

	entity.AddComponent(components.NewCombatComponent(config.Class.Combat.Attack, config.Class.Combat.Defense, config.Class.Combat.AttackRange, config.Class.Combat.AttackSpeed))

	entity.AddComponent(components.NewItemIDListComponent(config.ItemIDList))

	entity.AddComponent(components.NewStatsComponent(config.Class.Stats.Strength, config.Class.Stats.Agility, config.Class.Stats.Vitality, config.Class.Stats.Intelligence))

	// initialize equipment with loadout
	entity.AddComponent(components.NewEquipmentComponent(config.PlayerLoadout))

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

type FireballConfig struct {
	OwnerEntityID    uuid.UUID
	StartX, StartY   float64
	TargetX, TargetY float64
	Damage           int
	Speed            float64
	MaxDistance      float64
	Radius           float64
}

func CreateFireballEntity(em *ecs.EntityManager, config FireballConfig) *ecs.Entity {
	dx := config.TargetX - config.StartX
	dy := config.TargetY - config.StartY
	dist := math.Hypot(dx, dy)

	vx := 0.0
	vy := 0.0
	if dist > 0 {
		vx = (dx / dist) * config.Speed
		vy = (dy / dist) * config.Speed
	} else {
		vx = config.Speed
	}

	entity := em.CreateEntity()
	entity.AddComponent(components.NewTransformComponent(config.StartX, config.StartY))
	entity.AddComponent(components.NewVelocityComponent(vx, vy, config.Speed))
	entity.AddComponent(components.NewProjectileComponent(
		config.OwnerEntityID,
		config.Damage,
		config.Speed,
		config.MaxDistance,
		config.Radius,
		"fireball",
	))
	return entity
}
