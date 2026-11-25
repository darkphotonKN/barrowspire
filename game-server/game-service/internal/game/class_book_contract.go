package game

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/google/uuid"
)

/**
* A page whose effect is one of the session's entry points (FS-X2CMM §J R55,
* R57: Pick the Lock → OpenCage, Take a Contract → TakeContract) is refused as
* that entry point refuses, at its cast or its cast's end (advanceCasts), and,
* unlike a page its book's gates refuse (§A R4, FS-8AY7S R10), the caster is
* told why: the cast's reply carries the reason, from which the client writes
* its line, as an interact's refusal does (FS-4EC7Z §F R27).
**/

// The reasons a refused Take a Contract's reply gives beside
// RefusalContractTaken: the top floor, with no stairs to lose it on, and a
// floor with no room for the mark. FS-4EC7Z §E R16-R17.
const (
	RefusalContractNoStairs = "contract_no_stairs"
	RefusalContractNoRoom   = "contract_no_room"
)

// RefusalCageOpen is a refused Pick the Lock's reason for a cage already open:
// its key opened it during the 4 s cast. FS-X2CMM §J R55.
const RefusalCageOpen = "cage_open"

// pageRefusal is a refused entry point's reply: its reason and plain words.
type pageRefusal struct {
	err     error
	reason  string
	message string
}

// pageRefusals are the entry points' refusals told to the caster. Any other
// (the taker out of play, no floors, no such cage) is a book gate's or no
// run's, and sends nothing.
var pageRefusals = []pageRefusal{
	{ErrContractTaken, RefusalContractTaken, "a contract was already taken this delve"},
	{ErrContractNoStairs, RefusalContractNoStairs, "no contract on the top floor"},
	{ErrNoMarkRoom, RefusalContractNoRoom, "no room on this floor holds a mark"},
	{ErrCageOpen, RefusalCageOpen, "the cage is already open"},
	{ErrTooManyAllies, RefusalTooManyAllies, "too many follow you already"},
}

// refusePage tells the caster why an entry point refused their page, on the
// cast's reply; any other refusal sends nothing.
func (s *Session) refusePage(playerID uuid.UUID, err error) {
	for _, r := range pageRefusals {
		if errors.Is(err, r.err) {
			s.sendRefusalToPlayer(playerID, string(constants.ActionCastSkill), r.message, r.reason, nil)
			return
		}
	}
}
