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
