package game

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// uniqueEffects is the kill consumer for the worn uniques that answer a kill:
// kill_frenzy (Wightfang) and kill_heal (The Hollow Crown). FS-4R9M9
// §Requirements 29, 32–33, 38. Kill records only come from a run's tick, so
// nothing fires in the HUB; a killer dead, escaped or gone gets nothing. Each
// effect applies once however many copies are worn.
type uniqueEffects struct {
	em *ecs.EntityManager
}

func newUniqueEffects(em *ecs.EntityManager) *uniqueEffects {
	return &uniqueEffects{em: em}
}

func (u *uniqueEffects) ConsumeKill(record systems.KillRecord) {
	if record.KillerMemberID == uuid.Nil {
		return
	}
	killer, ok := u.inPlayDelver(record.KillerMemberID)
	if !ok {
		return
	}

	worn := systems.WornUniqueEffects(u.em, killer)
	if worn[types.UniqueEffectKillFrenzy] {
		addFrenzyStack(killer)
	}
	if worn[types.UniqueEffectKillHeal] {
		killHeal(killer)
	}
}

// inPlayDelver is the member's delver, while alive and in play.
func (u *uniqueEffects) inPlayDelver(memberID uuid.UUID) (*ecs.Entity, bool) {
	for _, entity := range u.em.GetAllEntities() {
		pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
		if !ok || pc.(*components.PlayerComponent).MemberID != memberID {
			continue
		}
		return entity, systems.InPlay(entity)
	}
	return nil, false
}

// addFrenzyStack adds one stack, up to the cap, and restarts the timer every
// stack shares. The GearSystem counts and runs it down. FS-4R9M9 §Requirements 32.
func addFrenzyStack(entity *ecs.Entity) {
	var frenzy *components.FrenzyComponent
	if fc, ok := entity.GetComponent(ecs.ComponentTypeFrenzy); ok {
		frenzy = fc.(*components.FrenzyComponent)
	} else {
		frenzy = &components.FrenzyComponent{}
		entity.AddComponent(frenzy)
	}
	frenzy.Stacks = min(frenzy.Stacks+1, FrenzyMaxStacks)
	frenzy.Remaining = FrenzyDurationSeconds
}

// killHeal restores max(1, round(4% × max health)), never above max.
// FS-4R9M9 §Requirements 33.
func killHeal(entity *ecs.Entity) {
	hc, ok := entity.GetComponent(ecs.ComponentTypeHealth)
	if !ok {
		return
	}
	health := hc.(*components.HealthComponent)
	heal := max(1, int(math.Round(float64(health.MaxHealth)*KillHealPercent/100)))
	health.CurrentHealth = min(health.CurrentHealth+heal, health.MaxHealth)
}
