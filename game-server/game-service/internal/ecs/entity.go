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

	// a delver's class book: its cooldowns, spent pages and states (FS-X2CMM §A)
	ComponentTypeBook ComponentType = "Book"
	// what a book ability leaves on the floor: a witchlight, a rune (FS-X2CMM §E)
	ComponentTypeBookEffect ComponentType = "BookEffect"
	// a rune's catch, on the rune's book effect (FS-X2CMM §E R24)
	ComponentTypeRune ComponentType = "Rune"
	// a hound's bite and heel, on the hound's book effect (FS-X2CMM §E R28)
	ComponentTypeHound ComponentType = "Hound"
	// the warrior's Long Night while it runs, on the warrior (FS-X2CMM §E R31)
	ComponentTypeLongNight ComponentType = "LongNight"
	// a drunk draught's heal while it runs, on the drinker (FS-X2CMM §E R27)
	ComponentTypeDraughtHeal ComponentType = "DraughtHeal"
	// a sealed floor's seals, their pieces, what a piece's first work wakes
	// and the barriers the seals hold shut (FS-5FZ4J §B, §C, §A R4)
	ComponentTypeSeal      ComponentType = "Seal"
	ComponentTypeSealPiece ComponentType = "SealPiece"
	// a lore piece, a mural or a shrine: read, part of no seal (FS-5FZ4J §C
	// R15, §F R39)
	ComponentTypeLorePiece ComponentType = "LorePiece"
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
	// the wandering merchant and his wares (FS-9JV5K §A R1-R4)
	ComponentTypeMerchant ComponentType = "Merchant"
	// a floor's encounter, its humanoid NPCs and the Lost Pilgrims' plea and
	// wave (FS-4EC7Z §A-§B)
	ComponentTypeEncounter    ComponentType = "Encounter"
	ComponentTypeEncounterNPC ComponentType = "EncounterNPC"
	ComponentTypePilgrimWave  ComponentType = "PilgrimWave"
	// a hired ally's fighting and following, and the Captives' cage and key
	// (FS-4EC7Z §C-§D)
	ComponentTypeAlly     ComponentType = "Ally"
	ComponentTypeCaptives ComponentType = "Captives"
	ComponentTypeCage     ComponentType = "Cage"
	ComponentTypeCageKey  ComponentType = "CageKey"
	// the Cutthroats' parley and hire (FS-4EC7Z §D R14-R15)
	ComponentTypeCutthroats ComponentType = "Cutthroats"
	// the delve's contract, its mark and the taker's Contract Settled
	// (FS-4EC7Z §E R16-R19)
	ComponentTypeContract        ComponentType = "Contract"
	ComponentTypeMark            ComponentType = "Mark"
	ComponentTypeContractSettled ComponentType = "ContractSettled"
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
