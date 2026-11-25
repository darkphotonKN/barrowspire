package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
PoisonSystem ticks poisoned bodies (FS-5FZ4J §D R29): a poisoned delver in
play, or a live encounter NPC (an ally or a peaceful one, FS-4EC7Z §C R9,
Edge States), loses PercentPerSecond of its max health a second, a fraction a
tick, until the poison's time runs out. It is not a hit: it writes health
straight, so it breaks no timed interact, counts as no attacker and credits
no monster; a delver it brings to 0 dies by the elimination as by any hit, an
encounter NPC as by the encounter's tick. Poison ends with its time, with a
cure (CurePoison), or with the body's play: dead, escaped or left behind.
*/
type PoisonSystem struct {
	PercentPerSecond float64
}

func NewPoisonSystem(percentPerSecond float64) *PoisonSystem {
	return &PoisonSystem{PercentPerSecond: percentPerSecond}
}

// poisonEpsilon absorbs the float drift of summing a tick's fraction.
const poisonEpsilon = 1e-9

// Update counts the tick on every poisoned body.
func (s *PoisonSystem) Update(dt float64, entities []*ecs.Entity) {
	for _, e := range entities {
		pc, poisoned := e.GetComponent(ecs.ComponentTypePoison)
		if !poisoned {
			continue
		}
		hc, hasHealth := e.GetComponent(ecs.ComponentTypeHealth)
		if !hasHealth || !poisonable(e) {
			e.RemoveComponent(ecs.ComponentTypePoison)
			continue
		}
		poison, health := pc.(*components.PoisonComponent), hc.(*components.HealthComponent)

		poison.Owed += float64(health.MaxHealth) * s.PercentPerSecond / 100 * min(dt, poison.Remaining)
		whole := math.Floor(poison.Owed + poisonEpsilon)
		poison.Owed = max(poison.Owed-whole, 0)
		health.CurrentHealth = max(health.CurrentHealth-int(whole), 0)
		poison.Remaining -= dt

		if poison.Remaining <= poisonEpsilon || health.CurrentHealth == 0 {
			e.RemoveComponent(ecs.ComponentTypePoison)
		}
	}
}

// poisonable is whether poison still takes from e: a delver in play or a live
// encounter NPC.
func poisonable(e *ecs.Entity) bool {
	if e.HasComponent(ecs.ComponentTypeEncounterNPC) {
		return alive(e)
	}
	return InPlay(e)
}

// Poison poisons entity for seconds: a poisoning already running is
// refreshed to seconds, never stacked (FS-5FZ4J §D R29). A hardened warrior
// takes no poisoning, nor a refresh of one running (FS-X2CMM §J R53).
func Poison(entity *ecs.Entity, seconds float64) {
	if Hardened(entity) {
		return
	}
	if pc, ok := entity.GetComponent(ecs.ComponentTypePoison); ok {
		pc.(*components.PoisonComponent).Remaining = seconds
		return
	}
	entity.AddComponent(&components.PoisonComponent{Remaining: seconds})
}

// CurePoison ends entity's poison, true when there was one to end: the entry
// point for the antidote (FS-9JV5K) and the archer's Brew (FS-X2CMM).
func CurePoison(entity *ecs.Entity) bool {
	if !entity.HasComponent(ecs.ComponentTypePoison) {
		return false
	}
	entity.RemoveComponent(ecs.ComponentTypePoison)
	return true
}

// PoisonedFor is the seconds of poison entity has left, false when it is not
// poisoned.
func PoisonedFor(entity *ecs.Entity) (float64, bool) {
	pc, ok := entity.GetComponent(ecs.ComponentTypePoison)
	if !ok {
		return 0, false
	}
	return pc.(*components.PoisonComponent).Remaining, true
}
