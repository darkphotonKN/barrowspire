package ecs

import (
	"sync"

	"github.com/google/uuid"
)

/**
* Entities
*
* extra team info: think of entities like a container that holds components.
*
**/

type ComponentType string

const (
	ComponentTypeMatchProgress ComponentType = "Entity"
	ComponentTypeFloor         ComponentType = "Floor"

	ComponentTypePlayer ComponentType = "Player"
	ComponentTypeNPC    ComponentType = "NPC"
	ComponentTypeEnemy  ComponentType = "Enemy"

	ComponentTypeItem       ComponentType = "Item"
	ComponentTypeDoor       ComponentType = "Door"
	ComponentTypeWall       ComponentType = "Wall"
	ComponentTypeContainer  ComponentType = "Container"
	ComponentTypeItemIDList ComponentType = "ItemIDList"

	ComponentTypeTransform ComponentType = "Transform"
	ComponentTypeVelocity  ComponentType = "Velocity"

	ComponentTypeHealth   ComponentType = "Health"
	ComponentTypeResource ComponentType = "Resource"
	ComponentTypeAttack   ComponentType = "Attack"
	ComponentTypeBuff     ComponentType = "Buff"
	ComponentTypeDebuff   ComponentType = "Debuff"
	ComponentTypeSkill    ComponentType = "Skill"
	ComponentTypeAbility  ComponentType = "Ability"
	// the class tree ability key 3 casts (FS-04EEA §A R2)
	ComponentTypeTreeAbility ComponentType = "TreeAbility"

	ComponentTypeStats      ComponentType = "Stats"
	ComponentTypeCombat     ComponentType = "Combat"
	ComponentTypeLevel      ComponentType = "Level"
	ComponentTypeExperience ComponentType = "Experience"
	ComponentTypeInventory  ComponentType = "Inventory"
	ComponentTypeEquipment  ComponentType = "Equipment"

	ComponentTypeInteractable ComponentType = "Interactable"
	ComponentTypeOpenable     ComponentType = "Openable"
	ComponentTypeDialogue     ComponentType = "Dialogue"

	ComponentTypeEscapeDoor ComponentType = "EscapeDoor"
	ComponentTypeLockable   ComponentType = "Lockable"
	ComponentTypeGuarded    ComponentType = "Guarded"
	ComponentTypeSwitch     ComponentType = "Switch"
	ComponentTypeStairs     ComponentType = "Stairs"
	ComponentTypeGate       ComponentType = "Gate"
	ComponentTypeProjectile ComponentType = "Projectile"

	ComponentTypeAttackIntent ComponentType = "AttackIntent"
	ComponentTypeCooldown     ComponentType = "Cooldown"
	ComponentTypeAttackPin    ComponentType = "AttackPin"

	ComponentTypeGearBonus ComponentType = "GearBonus"
	// the passive tree ranks a body holds (FS-8RZ51 R31)
	ComponentTypePassiveRanks ComponentType = "PassiveRanks"
	// what those ranks add to the body (FS-8RZ51 R25)
	ComponentTypePassiveBonus ComponentType = "PassiveBonus"
	ComponentTypeFrenzy       ComponentType = "Frenzy"

	ComponentTypeBurningTrail ComponentType = "BurningTrail"
	ComponentTypeDash         ComponentType = "Dash"
	ComponentTypeParry        ComponentType = "Parry"
	ComponentTypePotion       ComponentType = "Potion"
	ComponentTypeTimedOpen    ComponentType = "TimedOpen"

	// Bull Rush's mark: a charge just ended (FS-8RZ51 R29)
	ComponentTypeDashEnded ComponentType = "DashEnded"
	// Quick Draw's count of arrows fired in the world (FS-8RZ51 R29)
	ComponentTypeArrowCount ComponentType = "ArrowCount"

	// an Arrow Rain still falling (FS-04EEA §E R26)
	ComponentTypeArrowRain ComponentType = "ArrowRain"

	ComponentTypeRespawn ComponentType = "Respawn"

	// a Guardian's Last Stand spent on this floor (FS-E1ZDG §C R11-12)
	ComponentTypeLastStandSpent ComponentType = "LastStandSpent"

	// a tome run's plan on the run-level entity, and the tome and altar
	// themselves (FS-3103M §B-C)
	ComponentTypeTomePlan ComponentType = "TomePlan"
	ComponentTypeTome     ComponentType = "Tome"
	ComponentTypeAltar    ComponentType = "Altar"

	// a sealed floor's seals, their pieces, what a piece's first work wakes
	// and the barriers the seals hold shut (FS-5FZ4J §B, §C, §A R4)
	ComponentTypeSeal      ComponentType = "Seal"
	ComponentTypeSealPiece ComponentType = "SealPiece"
	ComponentTypeAmbush    ComponentType = "Ambush"
	ComponentTypeBarrier   ComponentType = "Barrier"
	// a stone block's push and slide, beside its seal piece (FS-5FZ4J §C R19)
	ComponentTypeStoneBlock ComponentType = "StoneBlock"
	// what the party has not seen yet, a secret door or a trap, and what a
	// shut secret door hides (FS-5FZ4J §F R37-R38, §D R30)
	ComponentTypeDetectable ComponentType = "Detectable"
	ComponentTypeConcealed  ComponentType = "Concealed"
	// a floor's traps and a delver's poison (FS-5FZ4J §D R23-R29)
	ComponentTypeTrap   ComponentType = "Trap"
	ComponentTypePoison ComponentType = "Poison"
	// the respites: a floor's healing fountain, a run's hallowed altar plan,
	// the altar itself and a delver's Blessing (FS-5FZ4J §G R40-R44)
	ComponentTypeFountain          ComponentType = "Fountain"
	ComponentTypeHallowedAltarPlan ComponentType = "HallowedAltarPlan"
	ComponentTypeHallowedAltar     ComponentType = "HallowedAltar"
	ComponentTypeBlessed           ComponentType = "Blessed"
)

type Entity struct {
	ID         uuid.UUID
	components map[ComponentType]Component
	mu         sync.RWMutex
}

func NewEntity() *Entity {
	return &Entity{
		ID:         uuid.New(),
		components: make(map[ComponentType]Component, 0),
	}
}

func (e *Entity) AddComponent(component Component) {
	e.mu.Lock()
	defer e.mu.Unlock()

	componentType := component.Type()

	e.components[componentType] = component
}

func (e *Entity) RemoveComponent(componentType ComponentType) {
	e.mu.Lock()
	defer e.mu.Unlock()

	delete(e.components, componentType)
}

func (e *Entity) HasComponent(componentType ComponentType) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()

	_, exists := e.components[componentType]

	return exists
}

func (e *Entity) GetComponent(componentType ComponentType) (Component, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	component, exists := e.components[componentType]

	return component, exists
}

func (e *Entity) GetComponents() []*Component {
	e.mu.RLock()
	defer e.mu.RUnlock()

	components := make([]*Component, 0)

	for _, component := range e.components {
		components = append(components, &component)
	}

	return components
}
