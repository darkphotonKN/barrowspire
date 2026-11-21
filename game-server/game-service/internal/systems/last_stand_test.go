package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-E1ZDG §C R11–13, the Guardian's Last Stand: once per floor, a hit that
	would take them to 0 leaves them at 1 HP with their stamina at its max. A
	monsterBlow takes 83 from every body here.
*/

var (
	guardianRanks  = passivetree.Ranks{"warrior.t6a": 1}
	berserkerRanks = passivetree.Ranks{"warrior.t6b": 1}
)

// struckAt is a warrior holding ranks at current HP and no stamina, struck
// once by a killing monster blow.
func struckAt(ranks passivetree.Ranks, current int) *kickerWorld {
	w := newKickerWorld("warrior", ranks, neverCrit)
	healthOf(w.body).CurrentHealth = current
	resourceOf(w.body).Current = 0
	w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
	return w
}

func TestLastStand_AKillingBlowLeavesTheGuardianAt1WithFullStamina(t *testing.T) {
	w := struckAt(guardianRanks, 10)
	assert.Equal(t, 1, healthOf(w.body).CurrentHealth)
	assert.Equal(t, resourceOf(w.body).Max, pool(w.body))
	assert.True(t, InPlay(w.body))
}

func TestLastStand_TheNextKillingBlowOnTheFloorKills(t *testing.T) {
	w := struckAt(guardianRanks, 10)
	w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
	assert.Zero(t, healthOf(w.body).CurrentHealth)
}

func TestLastStand_TwoKillingBlowsOnOneTick_TheFirstIsSavedTheSecondKills(t *testing.T) {
	w := newKickerWorld("warrior", guardianRanks, neverCrit)
	healthOf(w.body).CurrentHealth = 10
	w.tick(
		Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID},
		Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID},
	)
	assert.Zero(t, healthOf(w.body).CurrentHealth)
}

func TestLastStand_SavesAgainstABossStrike(t *testing.T) {
	w := newKickerWorld("warrior", guardianRanks, neverCrit)
	boss := ghoul(w.em, 140, 100, 1000)
	monster(boss).Boss = true
	healthOf(w.body).CurrentHealth = 10
	strike := monsterBlow()
	strike.AttackerEntityID = boss.ID
	w.tick(Impact{Attack: strike, TargetEntityID: w.body.ID})
	assert.Equal(t, 1, healthOf(w.body).CurrentHealth)
}

func TestLastStand_AtOneHP_AKillingBlowIsStillSavedOnce(t *testing.T) {
	w := struckAt(guardianRanks, 1)
	assert.Equal(t, 1, healthOf(w.body).CurrentHealth)
}

func TestLastStand_AHitThatLeavesThemStanding_SpendsNothing(t *testing.T) {
	w := newKickerWorld("warrior", guardianRanks, neverCrit)
	resourceOf(w.body).Current = 0
	w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
	assert.Equal(t, ownMaxHealth-monsterBlowTaken, healthOf(w.body).CurrentHealth)
	assert.Zero(t, pool(w.body), "no refill")

	healthOf(w.body).CurrentHealth = 10
	w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
	assert.Equal(t, 1, healthOf(w.body).CurrentHealth, "still ready")
}

func TestLastStand_AnyOtherWarriorDiesToTheSameBlow(t *testing.T) {
	tests := []struct {
		name  string
		ranks passivetree.Ranks
	}{
		{"a berserker", berserkerRanks},
		{"no specialization", passivetree.Ranks{"warrior.t2b": 3}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := struckAt(tt.ranks, 10)
			assert.Zero(t, healthOf(w.body).CurrentHealth)
			assert.Zero(t, pool(w.body), "no refill")
		})
	}
}

// The save is no change to the hit: a Gravewarden's Oath still answers a
// strike of 30 with 6, a fifth of the damage it resolved to (R11).
func TestLastStand_AnOathReflectAnswersTheResolvedDamage(t *testing.T) {
	w := newKickerWorld("warrior", guardianRanks, neverCrit)
	wearUnique(w.em, w.body, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	healthOf(w.body).CurrentHealth = 10
	troll := striker(w.em, 140, 100, 200)
	troll.AddComponent(&components.CombatComponent{Attack: 36, Defense: 50})

	strikeOnce(w.em, troll, w.body)

	assert.Equal(t, 1, healthOf(w.body).CurrentHealth)
	assert.Equal(t, 200-6, health(troll))
}

// In a field the Last Stand is once per visit: a respawn does not ready it
// again (R12).
func TestLastStand_AFieldRespawnLeavesItSpent(t *testing.T) {
	w := struckAt(guardianRanks, 10)
	w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
	require.Zero(t, healthOf(w.body).CurrentHealth)

	sys, entities := respawnSystem(), w.em.GetAllEntities()
	fall(sys, entities, w.body)
	fallFor(sys, entities, riseAfter)
	require.True(t, InPlay(w.body), "risen")

	healthOf(w.body).CurrentHealth = 10
	w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
	assert.Zero(t, healthOf(w.body).CurrentHealth)
}
