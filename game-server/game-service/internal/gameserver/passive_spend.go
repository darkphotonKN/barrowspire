package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// spend_passive_point (FS-8RZ51 §D R16–R22; ADR-0082, ADR-0083).
//
// A point is spent in town only, by the connection's player (ADR-0079), on
// their character in play. game-service checks the spend rule for the
// player's answer and character-service checks it again where it writes it
// (R13). On success the record takes the ranks at once and the HUB world body
// with them; nothing is sent, the next state shows it (R20).

// PassiveSpender spends one passive point at character-service: the character
// takes rank of nodeID, and every rank it holds after is answered, a target
// already held included (R10, R12). A refusal is the spend rule's own
// (*passivetree.Refusal); a character not the member's is
// types.ErrCharacterNotFound; anything else means it could not answer.
type PassiveSpender interface {
	SpendPassivePoint(ctx context.Context, memberID, characterID uuid.UUID, nodeID string, rank int) (passivetree.Ranks, error)
}

// passiveSpendTimeout bounds one spend, the queue read and character-service
// together; it runs off the message hub's loop (R19).
const passiveSpendTimeout = 3 * time.Second

// The refusals, word for word (FS-8RZ51 §Edge States, §Change: Tree v2 V18).
const (
	passiveNotInTown    = "Points are spent in town."
	passiveQueued       = "Leave the queue to spend points."
	passiveMaxRank      = "Already at its highest rank."
	passiveOutOfOrder   = "Take the ranks one at a time."
	passiveUnknownNode  = "Unknown node."
	passiveNoPoints     = "No points to spend."
	passiveNotLinked    = "Not reachable yet: take a node linked to it first."
	passiveSideLocked   = "Locked: you chose the other side."
	passiveNotSaved     = "Could not save the point. Try again."
	passiveLevelPending = "Your new level is still being recorded. Try again in a moment."
)

// specializationNames is the name of each specialization (FS-E1ZDG R1), the
// one name the refusals use. The client owns the rest of the tree's copy,
// the kicker names included (V18).
var specializationNames = map[string]string{
	passivetree.Guardian:     "Guardian",
	passivetree.Berserker:    "Berserker",
	passivetree.Spellwarden:  "Spellwarden",
	passivetree.Pyromancer:   "Pyromancer",
	passivetree.Hunter:       "Hunter",
	passivetree.ShadowRanger: "Shadow Ranger",
	passivetree.Duelist:      "Duelist",
	passivetree.Sellsword:    "Sellsword",
}

var (
	errSpendNotInTown = errors.New("passive spend outside the HUB world")
	errSpendQueued    = errors.New("passive spend while queued")
	errSpendMalformed = errors.New("passive spend payload malformed")
)

// spendRefusal is a spend refused, with the words the player is answered in.
type spendRefusal struct {
	words string
	err   error
}

func (r *spendRefusal) Error() string { return r.words + ": " + r.err.Error() }
func (r *spendRefusal) Unwrap() error { return r.err }

func refuseSpend(words string, err error) error { return &spendRefusal{words: words, err: err} }

// spendRefusalWords is what a refused spend says: its own words, or, for a
// spend that failed for want of an answer, that the point was not saved.
func spendRefusalWords(err error) string {
	var refused *spendRefusal
	if errors.As(err, &refused) {
		return refused.words
	}
	return passiveNotSaved
}

/**
* SpendPassivePoint takes rank of nodeID for the character in play of the
* player on conn (FS-8RZ51 R16–R20). Refused, with nothing called, outside the
* HUB world, while queued, and when the spend rule refuses it against the
* character in play; a target already held is a success with nothing called
* (R18). Otherwise character-service is asked, within ctx, and its answer is
* merged into the record by the higher rank per node, and the HUB world body
* raised to it. Never retried (R22). A refusal is answered in
* spendRefusalWords(err).
**/
func (s *Server) SpendPassivePoint(ctx context.Context, conn *websocket.Conn, nodeID string, rank int) error {
	player, ok := s.GetPlayerFromConn(conn)
	if !ok {
		return errPlayerNotFound
	}
	// the record's id never changes, so it is read without the lock
	memberID := player.ID

	character, inTown := s.townCharacterOf(memberID)
	if !inTown {
		return refuseSpend(passiveNotInTown, errSpendNotInTown)
	}

	// a queued member's run is built from the character they queued with; the
	// queue is read, never changed (R17, ADR-0082). Unreadable, nothing is
	// spent: the point is not lost, and the run's seating stays true
	_, queued, err := s.queue.QueuedCharacter(ctx, memberID)
	if err != nil {
		return refuseSpend(passiveNotSaved, fmt.Errorf("read queue entry: %w", err))
	}
	if queued {
		return refuseSpend(passiveQueued, errSpendQueued)
	}

	held := character.PassiveRanks
	verdict, err := passivetree.CheckSpend(character.Class, int32(character.Level), held, nodeID, rank)
	if err != nil {
		return refuseSpend(ruleRefusalWords(err, character.Class, held, nodeID), err)
	}
	if verdict == passivetree.AlreadyHeld {
		return nil
	}

	answered, err := s.characters.SpendPassivePoint(ctx, memberID, character.ID, nodeID, rank)
	if err != nil {
		var rule *passivetree.Refusal
		switch {
		// the level on the record is ahead of character-service's: the run's
		// grant is still on its way (R21; FS-BDA7X R25). Level is the only
		// input the two checks can disagree on, so a node our check found
		// reachable reads the same (V18)
		case errors.Is(err, passivetree.ErrNoPoints), errors.Is(err, passivetree.ErrNotReachable):
			return refuseSpend(passiveLevelPending, err)
		case errors.As(err, &rule):
			return refuseSpend(ruleRefusalWords(rule, character.Class, held, nodeID), err)
		default:
			return refuseSpend(passiveNotSaved, err)
		}
	}

	s.takePassiveRanks(memberID, character.ID, answered)
	return nil
}

// townCharacterOf is the member's character in play, and whether their record
// names the HUB world, read under the lock the record is written under.
func (s *Server) townCharacterOf(memberID uuid.UUID) (types.CharacterInPlay, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	record, exists := s.players[memberID]
	if !exists || s.hubSessionID == uuid.Nil || record.CurrentGameSessionId != s.hubSessionID {
		return types.CharacterInPlay{}, false
	}
	return record.Character, record.Character.ID != uuid.Nil
}

/**
* takePassiveRanks merges answered into every copy of the member's record still
* playing characterID, by the higher rank per node, so two answers landing out
* of order leave it right (R20), then raises the HUB world body to the same.
* A body in a field or a run is left alone: its next seating has them (R24).
* The ranks map is replaced, never written, since every copy shares it.
**/
func (s *Server) takePassiveRanks(memberID, characterID uuid.UUID, answered passivetree.Ranks) {
	merged := answered
	s.mu.Lock()
	if stored, exists := s.players[memberID]; exists {
		for _, record := range s.everyRecordOf(stored) {
			if record.Character.ID != characterID {
				continue
			}
			merged = passivetree.Higher(record.Character.PassiveRanks, answered)
			record.Character.PassiveRanks = merged
		}
	}
	s.mu.Unlock()

	// the world's own lock, never under the server's
	if hub, exists := s.HubSession(); exists {
		hub.RaisePassiveRanks(memberID, characterID, merged)
	}
}

// ruleRefusalWords is a spend rule refusal in the player's words (V18): a
// node not reachable yet says what it needs, a locked side names the
// specialization chosen when it is the spec group.
func ruleRefusalWords(err error, class string, held passivetree.Ranks, nodeID string) string {
	switch {
	case errors.Is(err, passivetree.ErrUnknownNode):
		return passiveUnknownNode
	case errors.Is(err, passivetree.ErrRankOutOfOrder):
		return passiveOutOfOrder
	case errors.Is(err, passivetree.ErrMaxRank):
		return passiveMaxRank
	case errors.Is(err, passivetree.ErrNoPoints):
		return passiveNoPoints
	case errors.Is(err, passivetree.ErrNotLinked):
		return passiveNotLinked
	case errors.Is(err, passivetree.ErrLevelTooLow):
		node, _ := passivetree.Lookup(nodeID)
		return fmt.Sprintf("Not reachable yet: reach level %d.", node.MinLevel)
	case errors.Is(err, passivetree.ErrSideTaken):
		return sideTakenWords(class, held, nodeID)
	default:
		return passiveNotSaved
	}
}

// sideTakenWords names the specialization the character chose when nodeID is
// in the spec group, and otherwise, or when held does not show the choice (a
// race character-service decided), says the other side was chosen.
func sideTakenWords(class string, held passivetree.Ranks, nodeID string) string {
	node, _ := passivetree.Lookup(nodeID)
	if node.Exclusive == nil || node.Exclusive.Group != passivetree.GroupSpec {
		return passiveSideLocked
	}
	if spec, ok := passivetree.SpecializationOf(class, held); ok {
		if name, named := specializationNames[spec]; named {
			return "You chose " + name + "."
		}
	}
	return passiveSideLocked
}

// spendPassivePoint answers one spend_passive_point off the loop: nothing when
// it lands, a refusal on the action otherwise (R19, R21).
func (h *messageHub) spendPassivePoint(clientPackage types.ClientPackage) {
	action := clientPackage.Message.Action
	nodeID, rank, err := passiveSpendOf(clientPackage.Message.Payload)
	if err != nil {
		slog.Debug("Refusing spend_passive_point: malformed payload", "error", err)
		h.refuse(clientPackage.Conn, action, spendRefusalWords(err))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), passiveSpendTimeout)
	defer cancel()

	err = h.sessionManager.SpendPassivePoint(ctx, clientPackage.Conn, nodeID, rank)
	switch {
	case err == nil:
		slog.Debug("Passive point spend landed", "node_id", nodeID, "rank", rank)
	case errors.Is(err, errPlayerNotFound):
		slog.Debug("spend_passive_point from a connection with no player")
	default:
		slog.Warn("Refusing spend_passive_point", "node_id", nodeID, "rank", rank, "error", err)
		h.refuse(clientPackage.Conn, action, spendRefusalWords(err))
	}
}

// passiveSpendOf reads { node_id, rank } off the socket: a node id, and a
// whole target rank of 1 or more.
func passiveSpendOf(payload map[string]interface{}) (string, int, error) {
	nodeID, _ := payload["node_id"].(string)
	if nodeID == "" {
		return "", 0, refuseSpend(passiveUnknownNode, fmt.Errorf("%w: node_id", errSpendMalformed))
	}
	rank, ok := payload["rank"].(float64)
	if !ok || rank < 1 || rank != math.Trunc(rank) || rank > math.MaxInt32 {
		return "", 0, refuseSpend(passiveOutOfOrder, fmt.Errorf("%w: rank %v", errSpendMalformed, payload["rank"]))
	}
	return nodeID, int(rank), nil
}
