package game

import (
	"fmt"
	"log/slog"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* Lever Order (FS-5FZ4J §C R15-R16): levers in rooms of their own, each
* bearing a glyph, pulled down in an order the mural in another room gives.
* An in-turn pull stays down and its first one wakes an ambush; an out-of-turn
* pull fires a dart volley at the puller and springs every lever back up; the
* last in-turn pull breaks the seal. One delver can walk the floor and pull
* each in turn: solvable by one (R10).
**/
type leverOrder struct{}

// leverCount is how many levers a Lever Order has on the floor at depth.
func leverCount(rng populationRand, depth int) int {
	if depth <= LeverLowFloorsMax {
		return LeverCountLow
	}
	return LeverCountMin + rng.IntN(LeverCountMax-LeverCountMin+1)
}

/**
* plan stands each lever in a room of its own and the mural in one more, rooms
* drawn from those a seal piece may stand in (sealRooms), each at a fixture's
* spot; a room with none is passed over for the next. The glyphs are drawn
* without repeats and the order is a random permutation of the levers.
**/
func (leverOrder) plan(s *Session, d *dungeonFloor, depth int) ([]plannedPiece, error) {
	levers := leverCount(s.spawnRand, depth)
	glyphs := slices.Clone(LeverGlyphs)
	shuffle(s.spawnRand, glyphs)
	turns := make([]int, levers)
	for i := range turns {
		turns[i] = i + 1
	}
	shuffle(s.spawnRand, turns)

	rooms := d.sealRooms()
	shuffle(s.spawnRand, rooms)

	var pieces []plannedPiece
	for _, room := range rooms {
		if len(pieces) == levers+1 {
			break
		}
		at, ok := s.placeFixture(d, room, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
		if !ok {
			continue
		}
		if i := len(pieces); i < levers {
			pieces = append(pieces, plannedPiece{kind: components.SealPieceLever, at: at, glyph: glyphs[i], turn: turns[i], wakes: true})
			continue
		}
		pieces = append(pieces, plannedPiece{kind: components.SealPieceMural, at: at})
	}
	if len(pieces) < levers+1 {
		return nil, fmt.Errorf("%d levers and a mural need %d rooms with a spot, found %d", levers, levers+1, len(pieces))
	}
	return pieces, nil
}

// work answers a pull on a lever or a look at the mural.
func (leverOrder) work(s *Session, w pieceWork) {
	levers := s.leversOf(w.seal.ID)
	if w.pc.Kind == components.SealPieceMural {
		readMural(s, w.playerID, levers)
		return
	}
	if w.pc.Active {
		s.sendRefusalToPlayer(w.playerID, string(constants.ActionInteract), "the lever is already down",
			RefusalLeverDown, nil)
		return
	}
	down := 0
	for _, lever := range levers {
		if lever.Active {
			down++
		}
	}
	if w.pc.Turn != down+1 {
		// out of turn: a dart volley at the puller, and the order starts again
		s.hitByTrap(w.piece.ID, w.delver, TrapFactorDartWall)
		for _, lever := range levers {
			lever.Active = false
		}
		s.sendRefusalToPlayer(w.playerID, string(constants.ActionInteract), "the lever was pulled out of turn",
			RefusalLeverWrong, nil)
		return
	}
	w.pc.Active = true
	// its first in-turn pull wakes its ambush (FS-5FZ4J §C R16)
	s.wakePieceAmbush(w.piece, w.delver)
	if down+1 == len(levers) {
		s.breakSeal(w.seal)
	}
}

// readMural answers a look at the mural with the glyphs in the order the
// levers are pulled: the hint is the order itself, written as a lore line by
// the client (FS-5FZ4J §C R15, §I R49). A lore piece: it wakes nothing.
func readMural(s *Session, playerID uuid.UUID, levers []*components.SealPieceComponent) {
	glyphs := make([]string, len(levers))
	for i, lever := range levers {
		glyphs[i] = lever.Glyph
	}
	if err := s.sender.SendMessageToPlayer(playerID, types.Message{
		Action:  string(constants.ActionInteract),
		Payload: map[string]interface{}{"success": true, "reason": ReasonMural, "glyphs": glyphs},
	}); err != nil {
		slog.Debug("Could not tell the reader the mural's glyphs", "player_id", playerID, "error", err)
	}
}

// leversOf is seal's levers, in turn order.
func (s *Session) leversOf(seal uuid.UUID) []*components.SealPieceComponent {
	levers := slices.DeleteFunc(s.piecesOf(seal), func(p *components.SealPieceComponent) bool {
		return p.Kind != components.SealPieceLever
	})
	slices.SortFunc(levers, func(a, b *components.SealPieceComponent) int { return a.Turn - b.Turn })
	return levers
}

// sealRooms is the rooms a seal piece may stand in: never the start room, the
// stairs room or a hidden room (FS-5FZ4J §A R5).
func (d *dungeonFloor) sealRooms() []int {
	barred := map[int]bool{d.layout.Roles.Start: true, d.layout.Roles.Stairs: true}
	for _, hidden := range d.layout.Hidden {
		barred[hidden.Room] = true
	}
	var rooms []int
	for room := range d.layout.Rooms {
		if !barred[room] {
			rooms = append(rooms, room)
		}
	}
	return rooms
}
