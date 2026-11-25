package systems

import (
	"errors"

	"github.com/google/uuid"
)

/**
* Take a Contract (FS-X2CMM §J R57). The mercenary's page places the delve's
* one contract, FS-4EC7Z's: the mark, its heading and Contract Settled are the
* session's (game/contract.go). The book reaches it through ContractTaker, the
* one entry point the session supplies on the page's ground, so this package
* never knows the session. The entry point judges the contract (one a delve,
* a floor with stairs, a room for the mark) and may refuse; the page is paid
* for only once it takes (resolve), so a refusal leaves the once-a-delve use
* unspent.
**/

// ErrNoContracts refuses a Take a Contract in a world that supplies no
// contract entry point.
var ErrNoContracts = errors.New("the world takes no contract")

// ContractTaker is the world's contract entry point: it places the delve's
// one contract for taker, a member id, or refuses with nothing taken.
// FS-4EC7Z §E R16.
type ContractTaker interface {
	TakeContract(taker uuid.UUID) error
}

// enterTakeAContract has Take a Contract's effect: the caster takes the
// delve's contract, or the world's refusal comes back as the cast's.
func enterTakeAContract(cast BookCast) error {
	if cast.Contracts == nil {
		return ErrNoContracts
	}
	return cast.Contracts.TakeContract(memberIDOf(cast.Caster))
}
