package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-E1ZDG §B R9: every player entry carries the body's specialization,
// current_player and every other_players entry alike, in every world; absent
// before the pick. I-E1ZDG-2.
func TestFormatStateToClientState_EveryPlayerEntryCarriesTheSpecialization(t *testing.T) {
	for _, world := range everyWorld {
		t.Run(string(world), func(t *testing.T) {
			w := newPartyWorld()
			delverOf(t, w.em, w.wren).AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"warrior.t6b": 1}))

			_, own := wireFor(t, w.em, world, w.wren)
			assert.Equal(t, "berserker", own["current_player"].(map[string]any)["specialization"])

			// a party member and a stranger both see it: the title is public
			for viewer, id := range map[string]uuid.UUID{"party member": w.mage, "stranger": w.stranger} {
				others := w.frameFor(t, world, id)
				require.Contains(t, others, w.wren, viewer)
				assert.Equal(t, "berserker", others[w.wren]["specialization"], viewer)
			}
		})
	}
}

// No specialization node held, or one naming another class's: the field is absent on
// both, never empty or null (R10).
func TestFormatStateToClientState_NoSpecializationIsAbsent(t *testing.T) {
	for name, ranks := range map[string]passivetree.Ranks{
		"no specialization node": {"warrior.r1": 1, "warrior.m4": 1},
		"another class's":        {"mage.t6a": 1},
		"an unknown node id":     {"warrior.t6z": 1},
	} {
		t.Run(name, func(t *testing.T) {
			w := newPartyWorld()
			delverOf(t, w.em, w.wren).AddComponent(components.NewPassiveRanksComponent(ranks))

			_, own := wireFor(t, w.em, everyWorld[0], w.wren)
			assert.NotContains(t, own["current_player"], "specialization")
			assert.NotContains(t, w.frameFor(t, everyWorld[0], w.mage)[w.wren], "specialization")
		})
	}
}
