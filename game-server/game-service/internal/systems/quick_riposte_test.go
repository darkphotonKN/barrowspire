package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
)

/*
	FS-E1ZDG §I R32, the Duelist's quick riposte: their cut resolves as the
	riposte at 2 or more parry charges and the riposte spends 2. Their max stays
	3. A dummy 80 px down the aim stands past the cut's 55 px reach and inside
	the riposte's 90, so only a riposte touches it.
*/

var duelistRanks = passivetree.Ranks{"mercenary.t6a": 1}

// cutAt has a mercenary holding ranks and charges parry charges cut toward a
// dummy 80 px down the aim, returning the damage it took and the charges left.
func cutAt(ranks passivetree.Ranks, charges int) (damage, left int) {
	w := newMercWorld(ranks, neverCrit, charges)
	far := dummyOffAim(w.em, 80, 0)
	w.cast(components.AttackCut, 200, 100)
	return 1000 - health(far), pool(w.body)
}

func TestQuickRiposte_ADuelistRipostesAtTwoAndSpendsTwo(t *testing.T) {
	tests := []struct {
		name        string
		charges     int
		wantRiposte bool
		wantLeft    int
	}{
		{"at 1, a cut", 1, false, 1},
		{"at 2, the riposte, leaving 0", 2, true, 0},
		{"at 3, the riposte, leaving 1", 3, true, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			damage, left := cutAt(duelistRanks, tt.charges)
			if tt.wantRiposte {
				assert.Equal(t, mercRiposte(0), damage, "the riposte's reach and power, unchanged")
			} else {
				assert.Zero(t, damage, "past the cut's reach")
			}
			assert.Equal(t, tt.wantLeft, left)
		})
	}
}

func TestQuickRiposte_AnUnspecializedMercStillNeedsAndSpendsThree(t *testing.T) {
	damage, left := cutAt(passivetree.Ranks{}, 2)
	assert.Zero(t, damage, "at 2, a cut")
	assert.Equal(t, 2, left)

	damage, left = cutAt(passivetree.Ranks{}, 3)
	assert.Equal(t, mercRiposte(0), damage, "at 3, the riposte")
	assert.Equal(t, 0, left)
}

// Edge States "Duelist at 3 charges who parries": the max is still 3.
func TestQuickRiposte_ADuelistAtThreeWhoParriesStaysAtThree(t *testing.T) {
	w := newMercWorld(duelistRanks, neverCrit, 3)
	troll := striker(w.em, 140, 100, 200)
	w.parryNow()
	strikeOn(troll, w.body)
	w.tick()

	assert.Equal(t, ownMaxHealth, health(w.body), "negated")
	assert.Equal(t, 3, resourceOf(w.body).Max)
	assert.Equal(t, 3, pool(w.body))
}
