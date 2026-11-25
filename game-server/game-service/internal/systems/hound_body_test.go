package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// FS-X2CMM §J R58, §E R28: a hound standing is a body of its own kind to the
// ground. It weighs on a plate as a body does, stands in a block's way and is
// hunted (and struck in melee) by monsters, whose area abilities spare it; it pushes no block, detects nothing, fires
// no trap and breathes no cloud. I-X2CMM-17.

// bodyHoundAt sets a hound down at (x, y) with 40 health and its 40 s, as a
// call does, for an archer who is no body here.
func bodyHoundAt(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	hound := SetDownBookEffect(em, components.BookEffectHound, x, y, houndSeconds, em.CreateEntity())
	hound.AddComponent(components.NewHealthComponent(40, 40))
	hound.AddComponent(components.NewVelocityComponent(0, 0, 0))
	hound.AddComponent(&components.HoundComponent{OwnerMemberID: uuid.New(), Action: components.HoundActionIdle})
	return hound
}

func TestBodyKindOf_AHoundWeighsAndIsHunted(t *testing.T) {
	em := ecs.NewEntityManager()
	down := bodyHoundAt(em, 0, 0)
	healthT(t, down).CurrentHealth = 0
	gone := bodyHoundAt(em, 0, 0)
	ec, _ := gone.GetComponent(ecs.ComponentTypeBookEffect)
	ec.(*components.BookEffectComponent).Remaining = 0

	cases := []struct {
		name           string
		entity         *ecs.Entity
		want           BodyKind
		weighs, hunted bool
	}{
		{"a hound standing", bodyHoundAt(em, 0, 0), BodyHound, true, true},
		{"a hound at no health", down, BodyNone, false, false},
		{"a hound whose time is up", gone, BodyNone, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind := BodyKindOf(c.entity)
			assert.Equal(t, c.want, kind)
			assert.Equal(t, c.weighs, kind.Weighs())
			assert.Equal(t, c.hunted, kind.Hunted())
			assert.False(t, kind.Pushes(), "it pushes no block")
			assert.False(t, kind.Detects(), "it detects nothing")
			assert.False(t, kind.FiresTraps(), "it fires no trap")
			assert.False(t, kind.Breathes(), "no cloud poisons it")
		})
	}
}

// A hound is a body in a block's way: a shove (or a push) onto its cell is
// refused, as onto any body's (FS-5FZ4J §C R19).
func TestShoveStoneBlock_RefusedOntoAHound(t *testing.T) {
	w := newPushWorld(t)
	bodyHoundAt(w.em, 6.5*blockCell, 5.5*blockCell)

	assert.False(t, ShoveStoneBlock(w.grid, w.block, 1, 0, uuid.New(), w.em.GetAllEntities()))
	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
}

// A monster's area ability spares a standing hound: it strikes the delvers
// in its reach (and the encounter NPCs monsters hunt), never the hound, which
// monsters still chase and strike in melee (FS-X2CMM "Reconciled at review
// (wave 1)").
func TestHuntedHit_AMonstersAbilitySparesAStandingHound(t *testing.T) {
	em := ecs.NewEntityManager()
	bodyHoundAt(em, 0, 0)
	d := delver(em, 0, 0)

	hit := huntedHit(components.AttackSnapshot{FromMonster: true}, em.GetAllEntities(), PlayerDamageOff)

	var ids []uuid.UUID
	for _, b := range hit {
		ids = append(ids, b.entity.ID)
	}
	assert.Equal(t, []uuid.UUID{d.ID}, ids)
}

// A troll's slam lands on the delver in its circle and passes by the hound
// standing beside them. FS-C8VM7 §B R14.
func TestMonsterAbility_SlamSparesAHoundInItsCircle(t *testing.T) {
	em := ecs.NewEntityManager()
	bloodTroll(t, em, 500, 500)
	target := sturdy(delver(em, 580, 500))
	hound := bodyHoundAt(em, 500, 580)
	brawl(em, 1)
	brawl(em, ticks(0.9))

	assert.Less(t, health(target), 100000, "the delver in the circle is hit")
	assert.Equal(t, 40, healthT(t, hound).CurrentHealth, "the hound is spared")
}
