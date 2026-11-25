package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
Contract Settled (FS-4EC7Z §E R19) is the taker's reward for a settled
contract: a component on the body, so it is kept across every floor change,
and taken off at death by the elimination. It multiplies the delver's
outgoing damage, read into the snapshot of an attack-table cast as the
Berserker's Blood Price is; it never stacks.
*/

// SettleContract gives entity Contract Settled at factor; one who holds it
// stays as they were.
func SettleContract(entity *ecs.Entity, factor float64) {
	if !entity.HasComponent(ecs.ComponentTypeContractSettled) {
		entity.AddComponent(&components.ContractSettledComponent{DamageFactor: factor})
	}
}

// ContractSettled is whether entity holds Contract Settled.
func ContractSettled(entity *ecs.Entity) bool {
	return entity.HasComponent(ecs.ComponentTypeContractSettled)
}

// settledDamage is what an attacker's own hits multiply their coefficient
// by: Contract Settled's factor for one who holds it, 1 for anyone else.
func settledDamage(attacker *ecs.Entity) float64 {
	cc, ok := attacker.GetComponent(ecs.ComponentTypeContractSettled)
	if !ok || cc.(*components.ContractSettledComponent).DamageFactor <= 0 {
		return 1
	}
	return cc.(*components.ContractSettledComponent).DamageFactor
}

// loseContractSettled takes a dead delver's Contract Settled off, on the
// tick of death.
func loseContractSettled(entity *ecs.Entity) {
	entity.RemoveComponent(ecs.ComponentTypeContractSettled)
}
