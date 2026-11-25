package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/**
* FS-5FZ4J §B R10, ADR-0092: every seal kind is solvable by one. For each, a
* floor built for one delver is broken by that delver alone along the kind's
* one-body path, scripted: the levers pulled in turn, every block pushed onto
* a plate, the secret door searched and the key turned in the gate, the ledge
* walked and the bridge lowered, the braziers lit inside the solo window. The
* stairs then climb and the way to them is open.
**/
func TestSeal_EveryKindSolvableByOne(t *testing.T) {
	tests := []struct {
		kind  components.SealKind
		solve func(t *testing.T) *Session
	}{
		{components.SealLeverOrder, func(t *testing.T) *Session {
			s, ids := dungeonRun(t, 7, 1, 0, forcedSeal(components.SealLeverOrder))
			clearMonsters(s)
			for _, lever := range leversInTurn(t, s) {
				pull(t, s, ids[0], lever)
				clearMonsters(s)
			}
			return s
		}},
		{components.SealWeightedPlates, func(t *testing.T) *Session {
			s, player, _ := platesRun(t, 11)
			plates := piecesOfKind(s, components.SealPiecePlate)
			blocks := piecesOfKind(s, components.SealPieceBlock)
			delver := delverEntity(t, s, player)
			for i := range plates {
				pushOnto(t, s, delver, blocks[i], pieceOf(plates[i]).Cell)
				clearMonsters(s)
			}
			start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
			transformOf(t, delver).X, transformOf(t, delver).Y = start.x, start.y
			tick(s)
			return s
		}},
		{components.SealHiddenKey, func(t *testing.T) *Session {
			k := newKeyRun(t, 7, 1)
			k.search(t, k.delvers[0])
			ticks(k.s, searchTicks)
			key, lies := stairKeyOf(k.s)
			require.True(t, lies, "the search opened the key's room")
			pull(t, k.s, k.delvers[0], key)
			clearMonsters(k.s)
			delver := transformOf(t, delverEntity(t, k.s, k.delvers[0]))
			delver.X, delver.Y, _, _ = gateApproach(k.s)
			require.NoError(t, k.s.handleInteract(k.delvers[0], gateOf(t, k.s).ID))
			return k.s
		}},
		{components.SealChasm, func(t *testing.T) *Session {
			s, ids, _ := chasmRun(t, 1, 1)
			delver := delverEntity(t, s, ids[0])
			end := walkLedge(t, s, delver)
			require.Greater(t, deepOf(chasmFrameOfFloor(s), end), nearestDeep(s, s.dungeon.chasm.band)+ChasmBandCells-1, "over the ledge")
			pull(t, s, ids[0], piecesOfKind(s, components.SealPieceBridgeLever)[0])
			return s
		}},
		{components.SealBraziers, func(t *testing.T) *Session {
			s, ids, _ := braziersRun(t, 7, 1)
			for i, brazier := range piecesOfKind(s, components.SealPieceBrazier) {
				if i > 0 {
					passSeconds(s, 40)
				}
				pull(t, s, ids[0], brazier)
			}
			return s
		}},
	}
	require.Len(t, tests, len(sealBandAll), "every kind")
	for _, tt := range tests {
		t.Run(string(tt.kind), func(t *testing.T) {
			s := tt.solve(t)
			seals := sealsOf(t, s)
			require.Len(t, seals, 1)
			require.Equal(t, tt.kind, seals[0].Kind)
			assert.True(t, seals[0].Broken, "one delver broke it")
			assert.False(t, s.sealHolds(), "the stairs climb")
			for _, gate := range barriersOfKind(s, components.BarrierGate) {
				assert.True(t, barrierOpen(gate), "the way to them is open")
			}
		})
	}
}
