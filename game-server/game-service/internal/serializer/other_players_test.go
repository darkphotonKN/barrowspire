package serializer

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-KE075 §I Requirements 51–53, ADR-0064. I-KE075-10.

// kitWorld is one world of each kind §I covers: the party world of FS-CH21F
// (Wren, her mage and mercenary, a stranger, a loner), every player with a bag
// of eight and five worn, and in a run the floor it stands on.
type kitWorld struct {
	name      string
	worldType types.WorldType
	depth     int
	cellSize  float64
}

var kitWorlds = []kitWorld{
	{"a run, floor 1 on a cell grid (cut)", types.WorldTypeRun, 1, 80},
	{"a run, floor 2 of buildings", types.WorldTypeRun, 2, 0},
	{"a field", types.WorldTypeField, 0, 0},
	{"the hub", types.WorldTypeHub, 0, 0},
}

func (k kitWorld) build() *partyWorld {
	w := newPartyWorld()
	if k.worldType == types.WorldTypeRun {
		onFloor(w.em, k.depth, k.cellSize)
	}
	item := newItemMaker(w.em)
	for _, e := range w.em.GetAllEntities() {
		if _, isPlayer := e.GetComponent(ecs.ComponentTypePlayer); isPlayer {
			kit(e, item)
		}
	}
	return w
}

// shownKeys are what every other player still carries: what the scenes, the
// party frames and the spectate view read. FS-KE075 §I R51.
var shownKeys = []string{
	"id", "entity_id", "username", "class", "position", "direction", "escape",
	"current_health", "max_health", "level", "experience", "level_floor", "next_level_at",
}

// No other player carries a bag or worn gear, in any world; each keeps every
// other key, and Wren's party members keep their resource and parry fields.
func TestFormatStateToClientState_OtherPlayersCarryNoBagOrWornGear(t *testing.T) {
	for _, world := range kitWorlds {
		t.Run(world.name, func(t *testing.T) {
			w := world.build()
			others := w.frameFor(t, world.worldType, w.wren)
			require.Len(t, others, 4, "every other player is still sent")

			for id, other := range others {
				assert.NotContains(t, other, "inventory", "another player's bag is never sent")
				assert.NotContains(t, other, "equipment", "nor their worn gear")
				for _, key := range shownKeys {
					assert.Contains(t, other, key, "player %s keeps %q", id, key)
				}
			}
			assert.Contains(t, others[w.mage], "resource", "a party member keeps their resource")
			assert.Contains(t, others[w.merc], "parry_open", "a party mercenary keeps their parry fields")
			assert.NotContains(t, others[w.stranger], "resource", "a stranger still carries no resource")
		})
	}
}

// ownKit is the bag and worn weapon in a recipient's own state on the wire.
func ownKit(t *testing.T, state *types.ClientGameState) (bag []any, weapon any) {
	t.Helper()
	me, ok := wireOf(t, state)["current_player"].(map[string]any)
	require.True(t, ok, "the recipient is told their own state")
	bag, _ = me["inventory"].([]any)
	equipment, _ := me["equipment"].(map[string]any)
	return bag, equipment["weapon"]
}

// Every recipient's own state keeps their own bag and worn gear, in every
// world, however many other recipients' frames were built first from the same
// backend state: trimming one recipient's view of a player never trims the
// shared state that player's own frame is built from. FS-KE075 §I R52, R53.
func TestFormatStateToClientState_OwnStateKeepsItsBagAndWornGear(t *testing.T) {
	for _, world := range kitWorlds {
		t.Run(world.name, func(t *testing.T) {
			w := world.build()
			s := NewStateSerializer(w.em, w.parties)
			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), world.worldType, w.em.GetAllEntities())
			require.NoError(t, err)

			recipients := []uuid.UUID{w.wren, w.mage, w.merc, w.stranger, w.solo}
			frames := make([]*types.ClientGameState, 0, len(recipients))
			for _, id := range recipients {
				frames = append(frames, s.FormatStateToClientState(backendState, id))
			}
			for i, frame := range frames {
				bag, weapon := ownKit(t, frame)
				assert.Len(t, bag, 8, "recipient %d keeps their whole bag", i)
				assert.NotNil(t, weapon, "recipient %d keeps their worn weapon", i)
			}
			for id, p := range backendState.Players {
				assert.Len(t, p.Inventory, 8, "the shared state of %s keeps its bag", id)
				require.NotNil(t, p.Equipment, "and its worn gear")
				assert.NotNil(t, p.Equipment.Weapon)
			}
		})
	}
}

// A dead delver left behind and an escaped delver still see their own bag and
// worn gear, and the delver still playing sees neither of them at all.
// FS-KE075 §I R52; FS-F6F88 §Requirements 15; FS-QPDKN §Requirements 24.
func TestFormatStateToClientState_LeftBehindAndEscapedKeepTheirOwnBag(t *testing.T) {
	em := ecs.NewEntityManager()
	onFloor(em, 2, 0)
	item := newItemMaker(em)
	playing, leftBehind, escaped := uuid.New(), uuid.New(), uuid.New()
	kit(addDelver(em, playing, 100, 100, 100), item)
	left := addDelver(em, leftBehind, 200, 200, 0)
	leftPlayer := components.NewPlayerComponent(leftBehind, "mage", "left", false)
	leftPlayer.LeftBehind = true
	left.AddComponent(leftPlayer)
	kit(left, item)
	gone := addDelver(em, escaped, 300, 300, 100)
	gone.AddComponent(components.NewPlayerComponent(escaped, "mage", "gone", true))
	kit(gone, item)

	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	for _, id := range []uuid.UUID{leftBehind, escaped} {
		bag, weapon := ownKit(t, s.FormatStateToClientState(backendState, id))
		assert.Len(t, bag, 8, "they keep their own bag")
		assert.NotNil(t, weapon, "and their worn weapon")
	}
	assert.Empty(t, s.FormatStateToClientState(backendState, playing).OtherPlayers,
		"the delver still playing sees neither the left-behind nor the escaped")
}

// A frame already sent is read by its connection's writer while the loop goes
// on: its other players, trimmed of their bag and worn gear, must share no
// memory the next tick's pool reset and refill write. Under -race the writer's
// reads and the next ticks' writes are checked directly. FS-KE075 §I R53,
// §G R38; FS-QG1HR D2 race B.
func TestFormatStateToClientState_SentOtherPlayersSurviveTheNextTicksPoolReset(t *testing.T) {
	for _, world := range kitWorlds {
		t.Run(world.name, func(t *testing.T) {
			first := world.build()
			s := NewStateSerializer(first.em, first.parties)
			ctx, sessionID := context.Background(), uuid.New()

			backendState, err := s.SerializeBackendState(ctx, sessionID, world.worldType, first.em.GetAllEntities())
			require.NoError(t, err)
			sent := s.FormatStateToClientState(backendState, first.wren)
			want, err := json.Marshal(sent)
			require.NoError(t, err)
			s.PutBackendState(backendState)

			var writer sync.WaitGroup
			writer.Add(1)
			go func() {
				defer writer.Done()
				for range 50 {
					_, _ = json.Marshal(sent)
				}
			}()

			// the next ticks: as many players, as kitted, every entity a new one
			for range 50 {
				next := world.build()
				state, err := s.SerializeBackendState(ctx, sessionID, world.worldType, next.em.GetAllEntities())
				require.NoError(t, err)
				for _, id := range []uuid.UUID{next.wren, next.mage} {
					_ = s.FormatStateToClientState(state, id)
				}
				s.PutBackendState(state)
			}
			writer.Wait()

			got, err := json.Marshal(sent)
			require.NoError(t, err)
			assert.JSONEq(t, string(want), string(got), "the next tick rewrote a frame already sent")
		})
	}
}
