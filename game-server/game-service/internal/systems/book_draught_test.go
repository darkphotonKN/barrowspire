package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §E R27, §F R34. I-X2CMM-7.

const draughtTick = 1.0 / 30

// draughtsIn is every draught on the floor.
func draughtsIn(em *ecs.EntityManager) []*ecs.Entity {
	var set []*ecs.Entity
	for _, e := range em.GetAllEntities() {
		if IsDraught(e) {
			set = append(set, e)
		}
	}
	return set
}

func healthT(t *testing.T, e *ecs.Entity) *components.HealthComponent {
	t.Helper()
	hc, ok := e.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	return hc.(*components.HealthComponent)
}

// brewedDraught is the draught a level-9 archer at (500, 500) brews, once its
// 3 s cast has run.
func brewedDraught(t *testing.T, em *ecs.EntityManager) (archer, draught *ecs.Entity) {
	t.Helper()
	before := len(draughtsIn(em))
	archer = bookDelver(em, "archer", 9, 500, 500, components.PageBrew)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(selfCast(archer, components.PageBrew)))
	for range 91 { // the cast's 3 s, and the tick it completes on
		books.AdvanceCasts(draughtTick, em.GetAllEntities(), nil, BookGround{}, PageEntryPoints{})
	}
	set := draughtsIn(em)
	require.Len(t, set, before+1, "the draught is set down")
	for _, d := range set {
		if ec, _ := d.GetComponent(ecs.ComponentTypeBookEffect); ec.(*components.BookEffectComponent).CasterID == archer.ID {
			return archer, d
		}
	}
	t.Fatal("no draught of this archer's")
	return nil, nil
}

// A level-9 archer's Brew takes 3 s; on completion 45 stamina is paid, its
// 120 s cooldown starts and a draught stands at the archer's feet. R27; §B.
func TestBookSystemAdvanceCasts_BrewSetsADraughtAtTheArchersFeet(t *testing.T) {
	em := ecs.NewEntityManager()

	archer, draught := brewedDraught(t, em)

	at, _ := bodyCentre(draught)
	assert.Equal(t, 500.0, at.X)
	assert.Equal(t, 500.0, at.Y)
	assert.Equal(t, 55, pool(archer), "100 - 45 stamina")
	assert.Equal(t, components.BookCooldown{Remaining: 120, Total: 120}, bookOfT(t, archer).Cooldowns[components.PageBrew])
}

// A draught has no time of its own: it stands, tick after tick, until it is
// drunk or the floor ends. R27.
func TestBookSystemUpdate_ADraughtStandsUntilDrunk(t *testing.T) {
	em := ecs.NewEntityManager()
	_, draught := brewedDraught(t, em)

	books := NewBookSystem(em)
	for range 30 * 600 { // ten minutes
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
	}

	_, ok := em.GetEntity(draught.ID)
	assert.True(t, ok, "still standing")
}

// A wounded teammate within 60 px drinks it: 30 % of their max health over
// 6 s in even parts each tick, the draught gone at once, draught on their
// states while it heals and gone with the last part. R27, R34.
func TestBookSystemDrinkDraught_HealsThirtyPercentOverSixSeconds(t *testing.T) {
	em := ecs.NewEntityManager()
	_, draught := brewedDraught(t, em)
	mate := bookDelver(em, "warrior", 1, 550, 500)
	healthT(t, mate).MaxHealth, healthT(t, mate).CurrentHealth = 200, 50
	books := NewBookSystem(em)

	require.NoError(t, books.DrinkDraught(mate, draught))

	_, standing := em.GetEntity(draught.ID)
	assert.False(t, standing, "drunk, the draught is gone")
	assert.Equal(t, 6.0, bookOfT(t, mate).States[components.BookStateDraught])

	for range 90 { // 3 s, half the heal
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
	}
	assert.Equal(t, 80, healthT(t, mate).CurrentHealth, "half of 60 in 3 s")
	assert.Contains(t, bookOfT(t, mate).States, components.BookStateDraught)
	assert.True(t, mate.HasComponent(ecs.ComponentTypeDraughtHeal), "the heal rides the drinker")

	for range 90 {
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
	}
	assert.Equal(t, 110, healthT(t, mate).CurrentHealth, "50 + 30 % of 200")
	assert.NotContains(t, bookOfT(t, mate).States, components.BookStateDraught, "healed, the state goes")
	assert.False(t, mate.HasComponent(ecs.ComponentTypeDraughtHeal), "and the heal with it")

	books.Update(draughtTick, em.GetAllEntities(), BookGround{})
	assert.Equal(t, 110, healthT(t, mate).CurrentHealth, "nothing after the 6 s")
}

// Each tick gives an even part: no tick gives more than one part's worth,
// rounded to a whole point. R27.
func TestBookSystemDrinkDraught_HealsInEvenPartsEachTick(t *testing.T) {
	em := ecs.NewEntityManager()
	_, draught := brewedDraught(t, em)
	mate := bookDelver(em, "warrior", 1, 500, 500)
	healthT(t, mate).MaxHealth, healthT(t, mate).CurrentHealth = 1000, 100
	books := NewBookSystem(em)
	require.NoError(t, books.DrinkDraught(mate, draught))

	// 300 over 180 ticks: 1 or 2 a tick, never 0 for long, never more
	for range 180 {
		before := healthT(t, mate).CurrentHealth
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
		gained := healthT(t, mate).CurrentHealth - before
		assert.GreaterOrEqual(t, gained, 1)
		assert.LessOrEqual(t, gained, 2)
	}
	assert.Equal(t, 400, healthT(t, mate).CurrentHealth)
}

// The heal never lifts the drinker above their max health. R27.
func TestBookSystemDrinkDraught_NeverHealsAboveMax(t *testing.T) {
	em := ecs.NewEntityManager()
	_, draught := brewedDraught(t, em)
	mate := bookDelver(em, "warrior", 1, 500, 500)
	healthT(t, mate).CurrentHealth = 90
	books := NewBookSystem(em)
	require.NoError(t, books.DrinkDraught(mate, draught))

	for range 180 {
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
		require.LessOrEqual(t, healthT(t, mate).CurrentHealth, 100)
	}
	assert.Equal(t, 100, healthT(t, mate).CurrentHealth)
}

// A second draught drunk during a heal restarts it at the new full amount:
// 6 s more, and the whole 30 % to come. R27; §Edge States "Two archers'
// draughts on one floor".
func TestBookSystemDrinkDraught_ASecondDraughtRestartsTheHeal(t *testing.T) {
	em := ecs.NewEntityManager()
	_, first := brewedDraught(t, em)
	_, second := brewedDraught(t, em)
	mate := bookDelver(em, "warrior", 1, 500, 500)
	healthT(t, mate).MaxHealth, healthT(t, mate).CurrentHealth = 200, 10
	books := NewBookSystem(em)

	require.NoError(t, books.DrinkDraught(mate, first))
	for range 90 {
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
	}
	require.Equal(t, 40, healthT(t, mate).CurrentHealth, "half of the first")

	require.NoError(t, books.DrinkDraught(mate, second))
	assert.Equal(t, 6.0, bookOfT(t, mate).States[components.BookStateDraught], "the 6 s restart")
	for range 180 {
		books.Update(draughtTick, em.GetAllEntities(), BookGround{})
	}
	assert.Equal(t, 100, healthT(t, mate).CurrentHealth, "40 + the whole 60 again")
}

// A draught is drunk once, by a delver in play within the interact reach;
// anything else is refused and leaves it standing. R27.
func TestBookSystemDrinkDraught_RefusesWhatCannotDrinkIt(t *testing.T) {
	tests := []struct {
		name   string
		ready  func(em *ecs.EntityManager, draught *ecs.Entity) (drinker, target *ecs.Entity)
		want   error
		stands bool
	}{
		{"out of the 60 px reach", func(em *ecs.EntityManager, draught *ecs.Entity) (*ecs.Entity, *ecs.Entity) {
			return bookDelver(em, "warrior", 1, 561, 500), draught
		}, ErrDraughtOutOfReach, true},
		{"fallen", func(em *ecs.EntityManager, draught *ecs.Entity) (*ecs.Entity, *ecs.Entity) {
			fallen := bookDelver(em, "warrior", 1, 500, 500)
			healthT(t, fallen).CurrentHealth = 0
			return fallen, draught
		}, ErrDrinkerOutOfPlay, true},
		{"not a draught", func(em *ecs.EntityManager, _ *ecs.Entity) (*ecs.Entity, *ecs.Entity) {
			light := SetDownBookEffect(em, components.BookEffectWitchlight, 500, 500, 20, bookDelver(em, "mage", 1, 0, 0))
			return bookDelver(em, "warrior", 1, 500, 500), light
		}, ErrNotADraught, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			_, draught := brewedDraught(t, em)
			drinker, target := tt.ready(em, draught)

			assert.ErrorIs(t, NewBookSystem(em).DrinkDraught(drinker, target), tt.want)
			_, standing := em.GetEntity(draught.ID)
			assert.Equal(t, tt.stands, standing)
			assert.NotContains(t, bookOfT(t, drinker).States, components.BookStateDraught)
		})
	}
}
