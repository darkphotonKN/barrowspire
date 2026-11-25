package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R49, FS-5FZ4J §D R30: a trap a page revealed carries revealed:
// true on its traps entry; one only come upon carries false. I-X2CMM-14.
func TestSerialize_ARevealedTrapCarriesRevealed(t *testing.T) {
	em := ecs.NewEntityManager()
	_, _, _, _ = sealedFloor(em)
	trap := func(revealed bool) *ecs.Entity {
		e := em.CreateEntity()
		e.AddComponent(&components.TrapComponent{Kind: components.TrapSpikePlate, Armed: true})
		e.AddComponent(components.NewTransformComponent(440, 440))
		e.AddComponent(&components.DetectableComponent{Spots: []components.Spot{{X: 440, Y: 440}}, Detected: true, Revealed: revealed})
		return e
	}
	revealed, seen := trap(true), trap(false)

	byID := map[string]any{}
	for _, entry := range asList(sealWireOf(t, em, types.WorldTypeRun)["traps"]) {
		byID[entry.(map[string]any)["entity_id"].(string)] = entry.(map[string]any)["revealed"]
	}
	assert.Equal(t, true, byID[revealed.ID.String()])
	assert.Equal(t, false, byID[seen.ID.String()])
}

// A hound carries bay {x, y} toward what it bays at while its bay shows, and
// no bay key otherwise; no other kind carries one. FS-X2CMM §J R49. I-X2CMM-14.
func TestFormatStateToClientState_AHoundCarriesItsBayWhileItBays(t *testing.T) {
	w := newPartyWorld()
	hound := addBookEffect(w.em, components.BookEffectHound, 300, 400, 25)
	hound.AddComponent(components.NewHealthComponent(30, 40))
	bay := &components.HoundComponent{OwnerMemberID: uuid.New(), Action: components.HoundActionIdle,
		BayShow: 1, BayAt: components.Spot{X: 640, Y: 400}}
	hound.AddComponent(bay)
	addBookEffect(w.em, components.BookEffectWitchlight, 310, 400, 5)

	houndEntry := func() map[string]any {
		_, frame := wireFor(t, w.em, types.WorldTypeRun, w.wren)
		var found map[string]any
		for _, e := range frame["book_effects"].([]any) {
			entry := e.(map[string]any)
			if entry["kind"] == "hound" {
				found = entry
				continue
			}
			assert.NotContains(t, entry, "bay")
		}
		require.NotNil(t, found)
		return found
	}

	assert.Equal(t, map[string]any{"x": float64(640), "y": float64(400)}, houndEntry()["bay"])

	bay.BayShow = 0
	assert.NotContains(t, houndEntry(), "bay", "its bay has stopped showing")
}
