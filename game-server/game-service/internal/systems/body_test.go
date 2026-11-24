package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// FS-5FZ4J §C R18-R19: the ground counts a body by its kind, never by whether
// it is a player: a delver in play weighs on a plate and pushes a block; a
// live monster does neither; a resolved delver, a dead monster and anything
// else are no body to it. A hired ally (FS-4EC7Z) joins as a kind that weighs.
func TestBodyKindOf_WhatTheGroundCounts(t *testing.T) {
	em := ecs.NewEntityManager()
	delver := func(health int, escaped bool) *ecs.Entity {
		e := em.CreateEntity()
		e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Delver", escaped))
		e.AddComponent(components.NewHealthComponent(health, 100))
		return e
	}
	monster := func(health int) *ecs.Entity {
		e := em.CreateEntity()
		e.AddComponent(&components.MonsterComponent{})
		e.AddComponent(components.NewHealthComponent(health, 100))
		return e
	}
	cases := []struct {
		name           string
		entity         *ecs.Entity
		want           BodyKind
		weighs, pushes bool
	}{
		{"a delver in play", delver(100, false), BodyDelver, true, true},
		{"a dead delver", delver(0, false), BodyNone, false, false},
		{"an escaped delver", delver(100, true), BodyNone, false, false},
		{"a live monster", monster(50), BodyMonster, false, false},
		{"a dead monster", monster(0), BodyNone, false, false},
		{"a crate", em.CreateEntity(), BodyNone, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			kind := BodyKindOf(tc.entity)
			assert.Equal(t, tc.want, kind)
			assert.Equal(t, tc.weighs, kind.Weighs())
			assert.Equal(t, tc.pushes, kind.Pushes())
			// whoever weighs on a plate fires a trap (FS-5FZ4J §D R25)
			assert.Equal(t, tc.weighs, kind.FiresTraps())
		})
	}
}
