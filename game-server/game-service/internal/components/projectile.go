package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

type ProjectileComponent struct {
	OwnerEntityID    uuid.UUID
	Damage           int
	Speed            float64
	MaxDistance      float64
	TraveledDistance float64
	Radius           float64
	ProjectileType   string // ex: fireball 跟skill不一樣的是有可能是skill的base 復合技能可能會觸發兩種ProjectileType，但一開始可能都會一樣
	ShouldDestroy    bool   // 銷毀的時機是設定成true時
}

func (p *ProjectileComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeProjectile
}

func NewProjectileComponent(ownerID uuid.UUID, damage int, speed float64, maxDistance float64, radius float64, projectileType string) *ProjectileComponent {
	return &ProjectileComponent{
		OwnerEntityID:  ownerID,
		Damage:         damage,
		Speed:          speed,
		MaxDistance:    maxDistance,
		Radius:         radius,
		ProjectileType: projectileType,
		ShouldDestroy:  false,
	}
}
