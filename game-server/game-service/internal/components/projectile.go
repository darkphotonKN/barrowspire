package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

type ProjectileComponent struct {
	OwnerEntityID uuid.UUID
	// Attack is the attacker as they were when this was fired. Mitigation is
	// the target's at impact. FS-77AB6 §Requirements 9.
	Attack           AttackSnapshot
	Speed            float64
	MaxDistance      float64
	TraveledDistance float64
	Radius           float64
	ProjectileType   string // ex: fireball 跟skill不一樣的是有可能是skill的base 復合技能可能會觸發兩種ProjectileType，但一開始可能都會一樣
	ShouldDestroy    bool   // 銷毀的時機是設定成true時
	// PierceLeft is how many more targets it may hit before it stops, and
	// HitEntityIDs what it has hit: it never hits the same target twice.
	// FS-4R9M9 §Requirements 35.
	PierceLeft   int
	HitEntityIDs []uuid.UUID
}

func (p *ProjectileComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeProjectile
}

func NewProjectileComponent(attack AttackSnapshot, speed float64, maxDistance float64, radius float64, projectileType string) *ProjectileComponent {
	return &ProjectileComponent{
		OwnerEntityID:  attack.AttackerEntityID,
		Attack:         attack,
		Speed:          speed,
		MaxDistance:    maxDistance,
		Radius:         radius,
		ProjectileType: projectileType,
		ShouldDestroy:  false,
		PierceLeft:     attack.Pierce,
	}
}
