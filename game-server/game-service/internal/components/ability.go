package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// AbilityComponent names a delver's ability: the attack row their class's
// right-click resolves to, priced in their class resource. FS-8AY7S
// §Requirements 12, 17.
type AbilityComponent struct {
	Kind AttackKind
}

func (a *AbilityComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeAbility
}

func NewAbilityComponent(kind AttackKind) *AbilityComponent {
	return &AbilityComponent{Kind: kind}
}

// TreeAbilityComponent names a delver's tree ability, the attack row their
// class's key 3 resolves to, and the tier-3 node of their class tree that
// grants it. Naming it is not holding it: the node must be among the ranks the
// body holds. FS-04EEA §A R2–R3.
type TreeAbilityComponent struct {
	Kind AttackKind
	// Node is the passive tree node id that grants Kind.
	Node string
}

func (t *TreeAbilityComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeTreeAbility
}

func NewTreeAbilityComponent(kind AttackKind, node string) *TreeAbilityComponent {
	return &TreeAbilityComponent{Kind: kind, Node: node}
}
