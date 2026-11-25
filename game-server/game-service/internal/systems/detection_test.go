package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

const detectionRadius = 160.0

// detectableAt is an undetected thing on one cell centred on (x, y).
func detectableAt(em *ecs.EntityManager, x, y float64) *components.DetectableComponent {
	e := em.CreateEntity()
	d := &components.DetectableComponent{Spots: []components.Spot{{X: x, Y: y}}}
	e.AddComponent(d)
	return d
}

// FS-5FZ4J §F R38, §D R30: a delver's body centre within 2 cells (160 px) of
// a spot detects it; 3 cells off does not.
func TestDetectionSystem_DetectsWithinTheRadius(t *testing.T) {
	em := ecs.NewEntityManager()
	bodyAt(em, 0, 0)
	near := detectableAt(em, 0, 160)
	far := detectableAt(em, 240, 0)

	NewDetectionSystem(detectionRadius).Update(em.GetAllEntities())

	assert.True(t, near.Detected, "2 cells off is seen")
	assert.False(t, far.Detected, "3 cells off is not")
}

// Any spot of a many-celled thing, a secret door across a corridor, counts.
func TestDetectionSystem_AnySpotCounts(t *testing.T) {
	em := ecs.NewEntityManager()
	bodyAt(em, 0, 0)
	e := em.CreateEntity()
	d := &components.DetectableComponent{Spots: []components.Spot{{X: 1000, Y: 0}, {X: 100, Y: 0}}}
	e.AddComponent(d)

	NewDetectionSystem(detectionRadius).Update(em.GetAllEntities())

	assert.True(t, d.Detected)
}

// A detection stays when the delver walks off; a monster, a dead delver and a
// left-behind delver detect nothing.
func TestDetectionSystem_StaysDetected_AndOnlyADelverInPlaySees(t *testing.T) {
	em := ecs.NewEntityManager()
	body := bodyAt(em, 0, 0)
	d := detectableAt(em, 0, 80)
	sys := NewDetectionSystem(detectionRadius)
	sys.Update(em.GetAllEntities())
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X = 5000
	sys.Update(em.GetAllEntities())
	assert.True(t, d.Detected, "a detection never un-happens")

	em = ecs.NewEntityManager()
	monster := em.CreateEntity()
	monster.AddComponent(&components.MonsterComponent{})
	monster.AddComponent(components.NewTransformComponent(0, 0))
	monster.AddComponent(components.NewHealthComponent(10, 10))
	dead := bodyAt(em, 0, 0)
	hc, _ := dead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	unseen := detectableAt(em, 0, 80)
	NewDetectionSystem(detectionRadius).Update(em.GetAllEntities())
	assert.False(t, unseen.Detected, "a monster and the dead see nothing")
}
