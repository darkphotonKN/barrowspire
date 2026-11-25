package game

import (
	"fmt"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Braziers (FS-5FZ4J §E R34): three braziers, each in a room of its own. An
* interact lights a cold one; the first lighting starts the window, sized by
* who is in play at that moment (BrazierWindowSolo for one delver, else
* BrazierWindow). All three lit inside it break the seal; when it ends with
* any cold, every brazier goes out and the next lighting starts a new window.
* Each brazier wakes an ambush the first time it is lit. One delver runs the
* floor inside 90 s: solvable by one (R10).
**/
type braziers struct{}

// plan stands each brazier in a room of its own, drawn from those a seal piece
// may stand in (sealRooms), at a fixture's spot; a room with none is passed
// over for the next.
func (braziers) plan(s *Session, d *dungeonFloor, _ int) ([]plannedPiece, error) {
	rooms := d.sealRooms()
	shuffle(s.spawnRand, rooms)
	var pieces []plannedPiece
	for _, room := range rooms {
		if len(pieces) == BrazierCount {
			break
		}
		at, ok := s.placeFixture(d, room, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
		if !ok {
			continue
		}
		pieces = append(pieces, plannedPiece{kind: components.SealPieceBrazier, at: at, wakes: true})
	}
	if len(pieces) < BrazierCount {
		return nil, fmt.Errorf("%d braziers need %d rooms with a spot, found %d", BrazierCount, BrazierCount, len(pieces))
	}
	return pieces, nil
}

// work lights a cold brazier of an unbroken seal: its first lighting wakes its
// ambush, the first of a window starts it, and the third lit breaks the seal.
// A lit brazier, or one of a broken seal, answers nothing.
func (braziers) work(s *Session, w pieceWork) {
	if w.sc.Broken || w.pc.Active {
		return
	}
	w.pc.Active = true
	s.wakePieceAmbush(w.piece, w.delver)
	if w.sc.WindowLeft <= 0 {
		w.sc.WindowLeft = brazierWindow(s.delversInPlay())
		slog.Debug("Brazier window started", "sessionID", s.ID, "seconds", w.sc.WindowLeft)
	}
	for _, piece := range s.piecesOf(w.seal.ID) {
		if piece.Kind == components.SealPieceBrazier && !piece.Active {
			return
		}
	}
	w.sc.WindowLeft = 0
	s.breakSeal(w.seal)
}

// brazierWindow is the window a first lighting starts with inPlay delvers in
// play: BrazierWindowSolo for one, else BrazierWindow (FS-5FZ4J §E R34).
func brazierWindow(inPlay int) float64 {
	if inPlay == 1 {
		return BrazierWindowSolo
	}
	return BrazierWindow
}

// watch runs an unbroken seal's window down by the tick; when it ends with a
// brazier cold, every brazier of the seal goes out (FS-5FZ4J §E R34).
func (braziers) watch(s *Session, dt float64, seal *ecs.Entity, sc *components.SealComponent, _ []*ecs.Entity) {
	if sc.Broken || sc.WindowLeft <= 0 {
		return
	}
	if sc.WindowLeft -= dt; sc.WindowLeft > 0 {
		return
	}
	sc.WindowLeft = 0
	for _, piece := range s.piecesOf(seal.ID) {
		if piece.Kind == components.SealPieceBrazier {
			piece.Active = false
		}
	}
	slog.Debug("Brazier window ran out", "sessionID", s.ID)
}
