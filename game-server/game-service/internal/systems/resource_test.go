package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// worldTick is the world's tick: 30 per second. FS-8AY7S §Requirements 5.
const worldTick = 1.0 / 30

// pooled stands a delver holding one class resource pool.
func pooled(em *ecs.EntityManager, kind components.ResourceKind, current, maximum, regen int) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
	e.AddComponent(components.NewHealthComponent(150, 150))
	e.AddComponent(components.NewResourceComponent(kind, current, maximum, regen))
	return e
}

func resourceOf(e *ecs.Entity) *components.ResourceComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeResource)
	return c.(*components.ResourceComponent)
}

// regenTicks runs the regen system n times at the given tick length.
func regenTicks(em *ecs.EntityManager, n int, tick float64) {
	sys := NewResourceSystem()
	for range n {
		sys.Update(tick, em.GetAllEntities())
	}
}

// Regen accrues exactly: whole seconds of ticks read whole amounts, never one
// short from float drift, and never pass max. FS-8AY7S §Requirements 5–6.
func TestResourceSystem_RegenAccruesExactlyAndStopsAtMax(t *testing.T) {
	tests := []struct {
		name  string
		kind  components.ResourceKind
		max   int
		regen int
		ticks int
		tick  float64
		want  int
	}{
		{"warrior stamina after 1 s at 30 Hz", components.ResourceStamina, 100, 20, 30, worldTick, 20},
		{"warrior stamina after 5 s at 30 Hz", components.ResourceStamina, 100, 20, 150, worldTick, 100},
		{"warrior stamina never passes max", components.ResourceStamina, 100, 20, 600, worldTick, 100},
		{"one tick short of a second reads one short", components.ResourceStamina, 100, 20, 29, worldTick, 19},
		{"mage mana after 1 s at 30 Hz", components.ResourceMana, 150, 4, 30, worldTick, 4},
		{"mage mana after 10 s at 30 Hz", components.ResourceMana, 150, 4, 300, worldTick, 40},
		{"mage mana one tick short of a second", components.ResourceMana, 150, 4, 29, worldTick, 3},
		{"stamina after 1 s at 60 Hz", components.ResourceStamina, 100, 20, 60, 1.0 / 60, 20},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			d := pooled(em, tt.kind, 0, tt.max, tt.regen)

			regenTicks(em, tt.ticks, tt.tick)

			assert.Equal(t, tt.want, resourceOf(d).Current)
			assert.LessOrEqual(t, resourceOf(d).Current, resourceOf(d).Max)
		})
	}
}

// A pool at max stays at max, with no fraction left over to overshoot it.
// FS-8AY7S §Edge States "Regen at max".
func TestResourceSystem_PoolAtMaxStaysAtMax(t *testing.T) {
	em := ecs.NewEntityManager()
	d := pooled(em, components.ResourceStamina, 100, 100, 20)

	regenTicks(em, 7, worldTick)
	assert.Equal(t, 100, resourceOf(d).Current)

	// spending from a full pool refills at the plain rate, no banked fraction
	resourceOf(d).Current -= 25
	regenTicks(em, 30, worldTick)
	assert.Equal(t, 95, resourceOf(d).Current)
}

// A pool with no regen never changes on its own: a parry-charges pool seated at
// 0 of 3 stays there. FS-8AY7S §Requirements 3–5.
func TestResourceSystem_ParryChargesNeverRegenerate(t *testing.T) {
	em := ecs.NewEntityManager()
	d := pooled(em, components.ResourceParryCharges, 0, 3, 0)

	regenTicks(em, 900, worldTick)

	assert.Equal(t, components.ResourceParryCharges, resourceOf(d).Kind)
	assert.Equal(t, 0, resourceOf(d).Current)
	assert.Equal(t, 3, resourceOf(d).Max)
}

// A delver out of play (dead, escaped, left behind) does not regen.
// FS-8AY7S §Requirements 5; §Edge States "Death", "Escape / left behind".
func TestResourceSystem_DelversOutOfPlayDoNotRegen(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(e *ecs.Entity)
	}{
		{"dead", func(e *ecs.Entity) {
			hc, _ := e.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 0
			hc.(*components.HealthComponent).IsEliminated = true
		}},
		{"escaped", func(e *ecs.Entity) {
			pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).Escape = true
		}},
		{"left behind", func(e *ecs.Entity) {
			pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).LeftBehind = true
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			d := pooled(em, components.ResourceStamina, 10, 100, 20)
			tt.resolve(d)

			regenTicks(em, 90, worldTick)

			assert.Equal(t, 10, resourceOf(d).Current)
		})
	}
}
