package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// ContractState is how the delve's one contract stands (FS-4EC7Z §E R16),
// the wire's contract state (§F R25).
type ContractState string

const (
	// ContractActive is a contract taken whose mark still lives
	ContractActive ContractState = "active"
	// ContractSettled is a contract whose mark the party killed (§E R19)
	ContractSettled ContractState = "settled"
	// ContractLost is a contract the party climbed away from, or whose taker
	// died or left, with its mark alive (§E R20)
	ContractLost ContractState = "lost"
)

/*
ContractComponent is the delve's one contract (FS-4EC7Z §E R16), on the
run-level entity, so it outlives every floor and a second is refused. Taker
is the member id of the delver who took it, Mark the mark's entity id on the
floor it was taken on. Heading is the compass word last given the taker for
the mark's direction (§E R21), refreshed every HeadingIn seconds while the
contract is active; empty once it is not.
*/
type ContractComponent struct {
	Taker     uuid.UUID
	Mark      uuid.UUID
	State     ContractState
	Heading   string
	HeadingIn float64
}

func (c *ContractComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeContract
}

/*
MarkComponent is a contract's mark (FS-4EC7Z §E R17-R18), beside its
MonsterComponent: whether it has called its cutthroats (once, at half its
health) and fled (once, at a quarter), and whether it has healed on reaching
where it fled to.
*/
type MarkComponent struct {
	Called bool
	Fled   bool
	Healed bool
}

func (m *MarkComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeMark
}

// ContractSettledComponent is the taker's Contract Settled (FS-4EC7Z §E
// R19): it rides the body, so it is kept across every floor change, and is
// taken off at death. DamageFactor is what it multiplies the delver's
// outgoing damage by.
type ContractSettledComponent struct {
	DamageFactor float64
}

func (c *ContractSettledComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeContractSettled
}
