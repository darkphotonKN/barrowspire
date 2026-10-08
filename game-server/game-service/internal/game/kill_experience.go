package game

import (
	"math"
	"sync"

	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

// KillExperience is the experience system: a kill consumer that awards each
// kill's experience to the party and levels them up on the spot.
// FS-BDA7X §Requirements 9–13, 16–17. Kill records only reach it from a run's
// tick, so the HUB, containers and escaping never award anything (R13).
type KillExperience struct {
	em    *ecs.EntityManager
	tally *RunExperience
}

func NewKillExperience(em *ecs.EntityManager, tally *RunExperience) *KillExperience {
	return &KillExperience{em: em, tally: tally}
}

// ConsumeKill gives every delver still in play, alive and un-escaped, the kill's
// experience in full. The killer gets no extra share; a death with no player
// killer awards nothing. FS-BDA7X §Requirements 9, 12.
func (k *KillExperience) ConsumeKill(record systems.KillRecord) {
	if record.KillerMemberID == uuid.Nil {
		return
	}
	amount := killExperience(record)
	if amount <= 0 {
		return
	}

	for _, entity := range k.em.GetAllEntities() {
		if !systems.InPlay(entity) {
			continue
		}
		pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)
		player := pc.(*components.PlayerComponent)

		gainExperience(entity, Classes[player.Class].Growth, amount)
		k.tally.add(player.MemberID, player.CharacterID, amount)
	}
}

// gainExperience adds experience to a delver and levels them up in the same
// tick, once per level crossed, up to the cap. Each level grows the attributes
// and max HP / MP by the class growth; current HP and MP do not change.
// FS-BDA7X §Requirements 8, 16–17, 19.
func gainExperience(entity *ecs.Entity, growth ClassGrowth, amount int) {
	sc, ok := entity.GetComponent(ecs.ComponentTypeStats)
	if !ok {
		return
	}
	stats := sc.(*components.StatsComponent)

	stats.Experience += amount
	reached := int(progression.LevelFor(int64(stats.Experience)))

	for ; stats.Level < reached; stats.Level++ {
		stats.Strength += growth.Strength
		stats.Agility += growth.Agility
		stats.Intelligence += growth.Intelligence
		stats.Vitality += growth.Vitality

		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
			hc.(*components.HealthComponent).MaxHealth += growth.MaxHealth
		}
		if mc, ok := entity.GetComponent(ecs.ComponentTypeMana); ok {
			mc.(*components.ManaComponent).MaxMana += growth.MaxMana
		}
	}
}

// killExperience is what one kill is worth to each member it is awarded to:
// round(base × (1 + growth × (level − 1)) × multiplier). FS-BDA7X §Requirements 10.
func killExperience(record systems.KillRecord) int {
	base, ok := killExperienceBase[record.Archetype]
	if !ok {
		return 0
	}

	multiplier := 1.0
	switch {
	case record.Boss:
		multiplier = BossExperienceMultiplier
	case record.Elite:
		multiplier = EliteExperienceMultiplier
	}

	levelFactor := 1 + KillExperienceLevelGrowth*float64(max(record.Level, 1)-1)

	return int(math.Round(float64(base) * levelFactor * multiplier))
}

// ExperienceGain is what one member's character has earned in a run.
type ExperienceGain struct {
	MemberID    uuid.UUID
	CharacterID uuid.UUID
	Amount      int
}

// RunExperience is the run's experience tally, kept off the player entities so
// a member removed before the run ends is still reported with what they earned.
// FS-BDA7X §Requirements 23. The tick writes it; the run's end reads it from
// another goroutine, hence the lock.
type RunExperience struct {
	mu    sync.Mutex
	gains map[uuid.UUID]ExperienceGain // by member
}

func NewRunExperience() *RunExperience {
	return &RunExperience{gains: make(map[uuid.UUID]ExperienceGain)}
}

func (r *RunExperience) add(memberID, characterID uuid.UUID, amount int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	gain := r.gains[memberID]
	gain.MemberID = memberID
	gain.CharacterID = characterID
	gain.Amount += amount
	r.gains[memberID] = gain
}

// Gains is a copy of every member's gain so far, in no particular order.
func (r *RunExperience) Gains() []ExperienceGain {
	r.mu.Lock()
	defer r.mu.Unlock()

	gains := make([]ExperienceGain, 0, len(r.gains))
	for _, gain := range r.gains {
		gains = append(gains, gain)
	}
	return gains
}
