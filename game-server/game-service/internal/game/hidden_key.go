package game

import (
	"errors"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* The Hidden Key (FS-5FZ4J §E R32): the floor's stair key lies in a hidden
* room of its own, behind a secret door. An interact on the key takes it: it
* leaves the world, the floor records that the party carries it, and its
* taking wakes an ambush. An interact on the shut gate while the party carries
* the key breaks the seal, opening the gate if it was the last to hold it
* (§B R13). Searching the secret door is the way for anyone: solvable by one
* (R10).
**/
type hiddenKey struct{}

// errNoKeyRoom is a floor drawn with the Hidden Key whose layout gave the key
// no hidden room: the floor's next seed is tried (§H R45).
var errNoKeyRoom = errors.New("no hidden room holds the stair key")

// plan stands the key at a fixture's spot in its hidden room.
func (hiddenKey) plan(s *Session, d *dungeonFloor, _ int) ([]plannedPiece, error) {
	room, ok := d.hiddenRoomOf(hiddenStairKey)
	if !ok {
		return nil, errNoKeyRoom
	}
	at, ok := s.placeFixture(d, room.Room, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
	if !ok {
		return nil, errors.New("the stair key's hidden room has no spot off its doorways")
	}
	return []plannedPiece{{kind: components.SealPieceStairKey, at: at, wakes: true}}, nil
}

// work takes the key: it wakes its ambush where it lay, then leaves the world,
// and the party carries it. The state says so (key_carried), not a reply.
func (hiddenKey) work(s *Session, w pieceWork) {
	if w.sc.KeyCarried {
		return
	}
	s.wakePieceAmbush(w.piece, w.delver)
	s.EntityManager.RemoveEntity(w.piece.ID)
	w.sc.KeyCarried = true
	slog.Info("Stair key taken", "sessionID", s.ID, "player_id", w.playerID)
}

// turnKey breaks the floor's unbroken Hidden Key seal whose key the party
// carries, on an interact at the shut gate; false when there is none, and the
// gate is refused as ever (§E R32, §B R13).
func (s *Session) turnKey() bool {
	for _, e := range s.EntityManager.GetAllEntities() {
		sc, ok := e.GetComponent(ecs.ComponentTypeSeal)
		if !ok {
			continue
		}
		seal := sc.(*components.SealComponent)
		if seal.Kind == components.SealHiddenKey && seal.KeyCarried && !seal.Broken {
			s.breakSeal(e)
			return true
		}
	}
	return false
}
