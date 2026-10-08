package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func ghoulAt(s *Session, x, y float64) *ecs.Entity {
	return CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: x, Y: y})
}

// A ghoul beside a delver winds up and strikes on the run's own tick, through the
// CombatSystem. FS-77AB6 §Requirements 1, 26–27.
func TestRun_GhoulBesideADelver_StrikesThem(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 500, 500)
	tick(s) // seated: the gear pass brings them to full, Vitality included
	before := currentHealth(delver)
	ghoulAt(s, 540, 500)

	tickFor(s, 1)

	assert.Less(t, currentHealth(delver), before)
}

// A ghoul in aggro walks to the delver through MovementSystem.
func TestRun_GhoulInAggro_ClosesOnTheDelver(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 500, 500)
	g := ghoulAt(s, 700, 500)

	tickFor(s, 1.5)

	d, m := transformOf(t, delver), transformOf(t, g)
	assert.Less(t, math.Hypot(m.X-d.X, m.Y-d.Y), 60.0)
}

// Monsters crowding a delver collide with the delver and with each other: none
// passes through another, and none freezes. FS-77AB6 AC "Monsters move through
// MovementSystem and collide"; FS-QG1HR D4.
func TestRun_MonstersSwarmingADelver_NeverOverlap(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 700, 480)
	// keep the delver standing: they have more than the swarm can take in the time
	hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 100000

	var swarm []*ecs.Entity
	for i := range 6 {
		angle := float64(i) * math.Pi / 3
		swarm = append(swarm, ghoulAt(s, 700+200*math.Cos(angle), 480+200*math.Sin(angle)))
	}

	tickFor(s, 3)

	bodies := append([]*ecs.Entity{delver}, swarm...)
	for i := range bodies {
		for j := i + 1; j < len(bodies); j++ {
			a, b := transformOf(t, bodies[i]), transformOf(t, bodies[j])
			assert.GreaterOrEqual(t, math.Hypot(a.X-b.X, a.Y-b.Y), 2*20.0-1, "bodies %d and %d overlap", i, j)
		}
	}
	d := transformOf(t, delver)
	for i, g := range swarm {
		m := transformOf(t, g)
		assert.Less(t, math.Hypot(m.X-d.X, m.Y-d.Y), 200.0, "ghoul %d never closed in", i)
	}
}

// Monsters killing a delver eliminate them through the existing path, and then
// leave the body alone. FS-77AB6 AC "a delver killed by monsters is eliminated".
func TestRun_DelverKilledByMonsters_IsEliminated(t *testing.T) {
	s := coopRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	// a second delver far off keeps the run going past the first one's death
	placeDelver(t, s, "archer", 1300, 900)
	tick(s) // seated first, so the 1 HP below is not topped up by the seating gear pass
	hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1
	g := ghoulAt(s, 540, 500)

	tickFor(s, 1)

	assert.Equal(t, map[uuid.UUID]int{playerID: 0}, s.eliminations)
	assert.NotEqual(t, delver.ID, monsterOf(g).Target, "still hunting a body")
	assert.Equal(t, 0, currentHealth(delver))
}

// The hub runs no monster AI: its tick order is unchanged.
func TestHub_RunsNoMonsterAI(t *testing.T) {
	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil, HubBounds())
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"})
	// the hub never holds one; stand one there to prove nothing would drive it
	g := ghoulAt(s, 1000, 760)

	tickFor(s, 1)

	assert.Equal(t, uuid.Nil, monsterOf(g).Target)
	at := transformOf(t, g)
	assert.Equal(t, 1000.0, at.X)
}
