package systems

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// Why a drink is refused. Each refusal is silent to the client: the HUD already
// shows it. FS-P9G8R §Requirements 6.
var (
	errDrinkOutOfPlay = errors.New("delver is out of play")
	errFullHealth     = errors.New("delver is at full health")
	errDrinkCooldown  = errors.New("drink cooldown is running")
	errNoHealthPotion = errors.New("no health potion equipped")
)

// drinkCooldown is the seconds of simulation time after a drink before the
// delver may drink again, shared by all three slots. FS-P9G8R §Requirements 9.
const drinkCooldown = 1.0

// drinkCooldownEpsilon absorbs the float error of counting a whole cooldown
// down in tick-sized steps, so 1.0 s of ticks always ends it.
const drinkCooldownEpsilon = 1e-9

// isHealthPotion is whether the item is a health potion: a consumable that
// heals. A mana potion is not one. FS-P9G8R §Requirements 1.
func isHealthPotion(item *components.ItemComponent) bool {
	return item.ItemType == types.ItemTypeConsumable && item.HealingAmount > 0
}

// PotionSystem drinks a delver's health potions. FS-P9G8R §Requirements 1, 5–12.
type PotionSystem struct {
	em *ecs.EntityManager
}

func NewPotionSystem(em *ecs.EntityManager) *PotionSystem {
	return &PotionSystem{em: em}
}

// Drink has the delver drink the health potion in their lowest consumable slot
// holding one: healed by its amount up to their maximum, the potion's entity
// removed and its slot emptied, its instance id (when it has a row) recorded as
// consumed, and the cooldown started. A refused drink changes nothing and says
// why.
func (p *PotionSystem) Drink(delver *ecs.Entity) error {
	if !InPlay(delver) {
		return errDrinkOutOfPlay
	}

	hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	if health.CurrentHealth >= health.MaxHealth {
		return errFullHealth
	}

	potions := potionsOf(delver)
	if potions.CooldownRemaining > 0 {
		return errDrinkCooldown
	}

	ec, ok := delver.GetComponent(ecs.ComponentTypeEquipment)
	if !ok {
		return errNoHealthPotion
	}
	equipment := ec.(*components.EquipmentComponent)

	holder, potion := p.firstHealthPotion(equipment)
	if potion == nil {
		return errNoHealthPotion
	}

	health.CurrentHealth = min(health.MaxHealth, health.CurrentHealth+potion.HealingAmount)

	p.em.RemoveEntity(**holder)
	*holder = nil

	potions.CooldownRemaining = drinkCooldown
	if potion.InstanceID != nil {
		potions.ConsumedItemIDs = append(potions.ConsumedItemIDs, *potion.InstanceID)
	}
	if !delver.HasComponent(ecs.ComponentTypePotion) {
		delver.AddComponent(potions)
	}

	return nil
}

// Update counts every delver's drink cooldown down by the tick's simulation
// time. It runs after the tick's drinks are applied, so the drink's own tick
// counts toward its cooldown.
func (p *PotionSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		pc, ok := entity.GetComponent(ecs.ComponentTypePotion)
		if !ok {
			continue
		}
		potions := pc.(*components.PotionComponent)
		if potions.CooldownRemaining <= 0 {
			continue
		}
		potions.CooldownRemaining -= deltaTime
		if potions.CooldownRemaining <= drinkCooldownEpsilon {
			potions.CooldownRemaining = 0
		}
	}
}

// potionsOf is the delver's drinking so far: their component, or a fresh one
// not yet on the body for a delver who has never drunk. It goes on the body
// only with an allowed drink, so a refusal adds nothing.
func potionsOf(delver *ecs.Entity) *components.PotionComponent {
	if pc, ok := delver.GetComponent(ecs.ComponentTypePotion); ok {
		return pc.(*components.PotionComponent)
	}
	return &components.PotionComponent{}
}

// firstHealthPotion is the slot holding the delver's next health potion and
// the potion, in the order Consumable1 → Consumable2 → Consumable3.
func (p *PotionSystem) firstHealthPotion(equipment *components.EquipmentComponent) (**uuid.UUID, *components.ItemComponent) {
	for _, slot := range SlotsFor(types.ItemTypeConsumable, "") {
		holder := slot.Holder(equipment)
		if *holder == nil {
			continue
		}
		entity, ok := p.em.GetEntity(**holder)
		if !ok {
			continue
		}
		ic, ok := entity.GetComponent(ecs.ComponentTypeItem)
		if !ok {
			continue
		}
		if item := ic.(*components.ItemComponent); isHealthPotion(item) {
			return holder, item
		}
	}
	return nil, nil
}
