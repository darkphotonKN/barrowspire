package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

/*
	FS-E1ZDG §E R19–21, the Spellwarden: a magic hit deals 10% less after magic
	resistance, and a quarter of every hit, rounded, is taken from mana first,
	the rest from HP.
*/

var (
	spellwardenRanks = passivetree.Ranks{"mage.t6a": 1}
	pyromancerRanks  = passivetree.Ranks{"mage.t6b": 1}
)

// mageWithMana is a mage holding ranks, with mana points of mana in a pool of 100.
func mageWithMana(ranks passivetree.Ranks, mana int) *kickerWorld {
	w := newKickerWorld("mage", ranks, neverCrit)
	resourceOf(w.body).Max = 100
	resourceOf(w.body).Current = mana
	return w
}

// monsterHitFor is a monster's hit that deals exactly damage, unmitigated.
func monsterHitFor(damage int) components.AttackSnapshot {
	return components.AttackSnapshot{AttackerEntityID: uuid.New(), FromMonster: true, TrueDamage: damage}
}

// monsterSpell is a monster's magic hit of 100 raw.
func monsterSpell() components.AttackSnapshot {
	return components.AttackSnapshot{
		AttackerEntityID: uuid.New(), DamageType: components.DamageMagic,
		Power: 100, Coefficient: 1, CritChance: BaseCritChance, FromMonster: true,
	}
}

func (w *kickerWorld) struckBy(attack components.AttackSnapshot) {
	w.tick(Impact{Attack: attack, TargetEntityID: w.body.ID})
}

func TestArcaneWard_TheHitSplitsBetweenManaAndHP(t *testing.T) {
	tests := []struct {
		name               string
		damage, mana       int
		wantMana, wantLost int
	}{
		{"a quarter from mana, the rest from HP", 40, 100, 90, 30},
		{"what mana cannot cover falls to HP", 40, 4, 0, 36},
		{"with no mana the whole hit goes to HP", 40, 0, 0, 40},
		{"a hit of 1 goes wholly to HP", 1, 100, 100, 1},
		{"a quarter rounds to the nearest point", 10, 100, 97, 7}, // 2.5
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := mageWithMana(spellwardenRanks, tt.mana)
			w.struckBy(monsterHitFor(tt.damage))
			assert.Equal(t, tt.wantMana, pool(w.body))
			assert.Equal(t, ownMaxHealth-tt.wantLost, healthOf(w.body).CurrentHealth)
		})
	}
}

func TestArcaneWard_AMitigatedStrikeIsWardedOnItsFinalDamage(t *testing.T) {
	plain := mageWithMana(nil, 100)
	plain.struckBy(monsterBlow())
	taken := ownMaxHealth - healthOf(plain.body).CurrentHealth
	ward := whole(float64(taken) / 4)

	w := mageWithMana(spellwardenRanks, 100)
	w.struckBy(monsterBlow())
	assert.Equal(t, 100-ward, pool(w.body))
	assert.Equal(t, ownMaxHealth-(taken-ward), healthOf(w.body).CurrentHealth)
}

func TestArcaneWard_OnAKillingBlow_ManaIsTakenFirstAndTheHPShareStillKills(t *testing.T) {
	w := mageWithMana(spellwardenRanks, 100)
	healthOf(w.body).CurrentHealth = 30
	w.struckBy(monsterHitFor(40))
	assert.Equal(t, 90, pool(w.body))
	assert.Zero(t, healthOf(w.body).CurrentHealth)
	assert.False(t, InPlay(w.body))
}

func TestSpellResistance_AMagicHitOnASpellwardenDealsATenthLess(t *testing.T) {
	plain := mageWithMana(pyromancerRanks, 0)
	plain.struckBy(monsterSpell())
	taken := ownMaxHealth - healthOf(plain.body).CurrentHealth

	w := mageWithMana(spellwardenRanks, 0)
	w.struckBy(monsterSpell())
	assert.Equal(t, ownMaxHealth-whole(float64(taken)*0.9), healthOf(w.body).CurrentHealth)
}

func TestSpellResistance_APhysicalHitOnASpellwardenIsUnchanged(t *testing.T) {
	w := mageWithMana(spellwardenRanks, 0)
	w.struckBy(monsterBlow())
	assert.Equal(t, ownMaxHealth-monsterBlowTaken, healthOf(w.body).CurrentHealth)
}

func TestArcaneWard_APyromancerAndAnUnspecializedMageAreUnchanged(t *testing.T) {
	for name, ranks := range map[string]passivetree.Ranks{"pyromancer": pyromancerRanks, "unspecialized": nil} {
		t.Run(name, func(t *testing.T) {
			w := mageWithMana(ranks, 100)
			w.struckBy(monsterHitFor(40))
			assert.Equal(t, 100, pool(w.body))
			assert.Equal(t, ownMaxHealth-40, healthOf(w.body).CurrentHealth)

			w.struckBy(monsterSpell())
			assert.Equal(t, ownMaxHealth-40-100, healthOf(w.body).CurrentHealth, "a magic hit of 100 against no magic resistance")
		})
	}
}
