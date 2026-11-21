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

// The refusals, word for word (FS-8RZ51 §Edge States).
const (
	passiveNotInTown    = "Points are spent in town."
	passiveQueued       = "Leave the queue to spend points."
	passiveMaxRank      = "Already at its highest rank."
	passiveOutOfOrder   = "Take the ranks one at a time."
	passiveUnknownNode  = "Unknown node."
	passiveNoPoints     = "No points to spend."
	passiveNotSaved     = "Could not save the point. Try again."
	passiveLevelPending = "Your new level is still being recorded. Try again in a moment."
)

// The names the refusals use: each class's tree ability (FS-04EEA R1) and the
// specialization each tier-6 node grants (FS-E1ZDG R1). The client owns the
// rest of the tree's copy.
var (
	treeAbilityNames = map[string]string{
		"warrior":   "Earthbreaker",
		"mage":      "Blink",
		"archer":    "Arrow Rain",
		"mercenary": "Settle the Debt",
	}
	specializationNames = map[string]string{
		"warrior.t6a":   "Guardian",
		"warrior.t6b":   "Berserker",
		"mage.t6a":      "Spellwarden",
		"mage.t6b":      "Pyromancer",
		"archer.t6a":    "Hunter",
		"archer.t6b":    "Shadow Ranger",
		"mercenary.t6a": "Duelist",
		"mercenary.t6b": "Sellsword",
	}
)

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
		// grant is still on its way (R21; FS-BDA7X R25)
		case errors.Is(err, passivetree.ErrNoPoints):
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

// ruleRefusalWords is a spend rule refusal in the player's words (§Edge
// States): a tier lock says what opens it, the specialization taken names it.
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
	case errors.Is(err, passivetree.ErrTierLocked):
		return tierLockedWords(class, held, nodeID)
	case errors.Is(err, passivetree.ErrSpecializationTaken):
		return specializationTakenWords(class, held)
	default:
		return passiveNotSaved
	}
}

// tierLockedWords says what opens nodeID's tier: the tree ability for tier 4,
// else how many more ranks the smaller tiers need.
func tierLockedWords(class string, held passivetree.Ranks, nodeID string) string {
	node, _ := passivetree.Lookup(nodeID)
	if node.Gate.Requires != "" && held[node.Gate.Requires] < 1 {
		name, ok := treeAbilityNames[class]
		if !ok {
			name = "the tree ability"
		}
		return "Take " + name + " first."
	}
	spent := 0
	for _, n := range passivetree.Nodes(class) {
		if n.Tier < node.Tier {
			spent += max(held[n.ID], 0)
		}
	}
	short := max(node.Gate.SpentAbove-spent, 1)
	if short == 1 {
		return "Spend 1 more point above to open this tier."
	}
	return fmt.Sprintf("Spend %d more points above to open this tier.", short)
}

// specializationTakenWords names the specialization the character holds.
func specializationTakenWords(class string, held passivetree.Ranks) string {
	if nodes, ok := passivetree.SpecializationNodes(class); ok {
		for _, n := range nodes {
			if held[n.ID] > 0 {
				if name, named := specializationNames[n.ID]; named {
					return "You chose " + name + "."
				}
			}
		}
	}
	return "You chose the other specialization."
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
