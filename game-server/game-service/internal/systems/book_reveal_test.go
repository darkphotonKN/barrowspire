package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R49, as reconciled at wave 2. I-X2CMM-14.

// secretDoorAt is a shut, undetected secret door on one cell centred on (x, y).
func secretDoorAt(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.BarrierComponent{Kind: components.BarrierSecretDoor})
	e.AddComponent(components.NewOpenableComponent(false))
	e.AddComponent(&components.DetectableComponent{Spots: []components.Spot{{X: x, Y: y}}})
	return e
}

// trapAt is an armed, undetected trap of the kind on the cell centred on
// (x, y), a tripwire with its ambush waiting.
func trapAt(em *ecs.EntityManager, kind components.TrapKind, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.TrapComponent{Kind: kind, Armed: true})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(&components.DetectableComponent{Spots: []components.Spot{{X: x, Y: y}}})
	if kind == components.TrapTripwire {
		e.AddComponent(&components.AmbushComponent{})
	}
	return e
}

// wakingPieceAt is a seal piece at (x, y) whose first work wakes an ambush.
func wakingPieceAt(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceLever})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(&components.AmbushComponent{})
	return e
}

func detectableT(t *testing.T, e *ecs.Entity) *components.DetectableComponent {
	t.Helper()
	dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
	require.True(t, ok)
	return dc.(*components.DetectableComponent)
}

func revealTick(em *ecs.EntityManager, deltaTime float64) {
	NewBookRevealSystem(testCell).Update(deltaTime, em.GetAllEntities())
}

// A burning witchlight detects and reveals every secret door and trap with a
// spot within 3 cells of its centre; 4 cells off stays hidden.
func TestBookReveal_WitchlightRevealsWithinThreeCells(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := bookDelver(em, "mage", 2, 5000, 5000)
	SetDownBookEffect(em, components.BookEffectWitchlight, 0, 0, witchlightSeconds, mage)
	door := secretDoorAt(em, 3*testCell, 0)
	trap := trapAt(em, components.TrapSpikePlate, 0, 3*testCell)
	far := trapAt(em, components.TrapTripwire, 4*testCell, 0)

	revealTick(em, 0.05)

	for _, e := range []*ecs.Entity{door, trap} {
		d := detectableT(t, e)
		assert.True(t, d.Detected, "within 3 cells is detected")
		assert.True(t, d.Revealed, "and revealed")
	}
	assert.False(t, detectableT(t, far).Detected, "4 cells off is not")
	assert.False(t, detectableT(t, far).Revealed)
}

// A witchlight whose time is up reveals nothing; a reveal stays once it goes.
func TestBookReveal_OnlyWhileTheWitchlightBurns(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := bookDelver(em, "mage", 2, 5000, 5000)
	light := SetDownBookEffect(em, components.BookEffectWitchlight, 0, 0, witchlightSeconds, mage)
	ec, _ := light.GetComponent(ecs.ComponentTypeBookEffect)
	ec.(*components.BookEffectComponent).Remaining = 0
	trap := trapAt(em, components.TrapSpikePlate, testCell, 0)

	revealTick(em, 0.05)
	assert.False(t, detectableT(t, trap).Detected, "a spent light reveals nothing")

	ec.(*components.BookEffectComponent).Remaining = witchlightSeconds
	revealTick(em, 0.05)
	ec.(*components.BookEffectComponent).Remaining = 0
	revealTick(em, 0.05)
	assert.True(t, detectableT(t, trap).Revealed, "a reveal never un-happens")
}

// While tracker's eye runs on an archer in play, every secret door and trap
// within 10 cells of them is detected and revealed; past 10 cells, or with
// the state over, nothing is.
func TestBookReveal_TrackersEyeRevealsWithinTenCellsOfTheArcher(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := bookDelver(em, "archer", 3, 0, 0, components.PageTrackersEye)
	near := trapAt(em, components.TrapTripwire, 10*testCell, 0)
	door := secretDoorAt(em, 0, -9*testCell)
	far := trapAt(em, components.TrapGasVent, 11*testCell, 0)

	revealTick(em, 0.05)
	assert.False(t, detectableT(t, near).Detected, "no tracker's eye, no reveal")

	setBookState(archer, components.BookStateTrackersEye, trackersEyeSeconds)
	revealTick(em, 0.05)

	assert.True(t, detectableT(t, near).Revealed, "10 cells off is revealed")
	assert.True(t, detectableT(t, near).Detected)
	assert.True(t, detectableT(t, door).Revealed)
	assert.False(t, detectableT(t, far).Detected, "11 cells off is not")
}

// An archer out of play reveals nothing, their tracker's eye running or not.
func TestBookReveal_TrackersEyeNeedsTheArcherInPlay(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := bookDelver(em, "archer", 3, 0, 0, components.PageTrackersEye)
	setBookState(archer, components.BookStateTrackersEye, trackersEyeSeconds)
	pc, _ := archer.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true
	trap := trapAt(em, components.TrapSpikePlate, testCell, 0)

	revealTick(em, 0.05)

	assert.False(t, detectableT(t, trap).Detected)
}

// A thing a delver already walked near (detected, not revealed) is revealed
// when a page reaches it.
func TestBookReveal_RevealsWhatWasOnlyDetected(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := bookDelver(em, "mage", 2, 5000, 5000)
	SetDownBookEffect(em, components.BookEffectWitchlight, 0, 0, witchlightSeconds, mage)
	trap := trapAt(em, components.TrapSpikePlate, testCell, 0)
	detectableT(t, trap).Detected = true

	revealTick(em, 0.05)

	assert.True(t, detectableT(t, trap).Revealed)
}

// --- the hound's bay ---

// houndAt is a standing hound at (x, y), its archer the given body.
func houndAt(em *ecs.EntityManager, archer *ecs.Entity, x, y float64) *ecs.Entity {
	hound := SetDownBookEffect(em, components.BookEffectHound, x, y, houndSeconds, archer)
	hound.AddComponent(components.NewHealthComponent(40, 40))
	hound.AddComponent(&components.HoundComponent{Action: components.HoundActionIdle})
	return hound
}

// The hound bays at a shut secret door within 6 cells, detected or not: its
// bay shows toward the door from that tick.
func TestBookReveal_HoundBaysAtAShutSecretDoor(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := houndAt(em, archer, 0, 0)
	secretDoorAt(em, 6*testCell, 0)

	revealTick(em, 0.05)

	h := houndT(t, hound)
	assert.Greater(t, h.BayShow, 0.0, "it bays")
	assert.Equal(t, components.Spot{X: 6 * testCell, Y: 0}, h.BayAt)
}

// It bays at the nearest of what it bays at: a seal piece or a tripwire whose
// ambush still waits, a shut secret door.
func TestBookReveal_HoundBaysAtTheNearest(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := houndAt(em, archer, 0, 0)
	secretDoorAt(em, 5*testCell, 0)
	wakingPieceAt(em, 0, 4*testCell)
	trapAt(em, components.TrapTripwire, -3*testCell, 0)

	revealTick(em, 0.05)

	assert.Equal(t, components.Spot{X: -3 * testCell, Y: 0}, houndT(t, hound).BayAt, "the tripwire is nearest")
}

// It bays at nothing else: an open secret door, a woken ambush, a trap with
// no ambush, a piece that wakes none, or anything past 6 cells, or concealed.
func TestBookReveal_HoundBaysAtNothingElse(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := houndAt(em, archer, 0, 0)
	open := secretDoorAt(em, testCell, 0)
	oc, _ := open.GetComponent(ecs.ComponentTypeOpenable)
	oc.(*components.OpenableComponent).IsOpen = true
	woken := trapAt(em, components.TrapTripwire, 0, testCell)
	ac, _ := woken.GetComponent(ecs.ComponentTypeAmbush)
	ac.(*components.AmbushComponent).Woken = true
	trapAt(em, components.TrapSpikePlate, -testCell, 0)
	quiet := em.CreateEntity()
	quiet.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceLever})
	quiet.AddComponent(components.NewTransformComponent(0, -testCell))
	wakingPieceAt(em, 7*testCell, 0)
	hidden := wakingPieceAt(em, 2*testCell, 2*testCell)
	hidden.AddComponent(&components.ConcealedComponent{})

	revealTick(em, 0.05)

	assert.Zero(t, houndT(t, hound).BayShow)
}

// A bay shows for houndBayShow and the hound bays again every houndBayEvery
// while something is near; a hound down bays at nothing.
func TestBookReveal_HoundBaysOnItsClock(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := houndAt(em, archer, 0, 0)
	secretDoorAt(em, testCell, 0)
	h := houndT(t, hound)

	revealTick(em, 0.05)
	require.InDelta(t, houndBayShow, h.BayShow, 1e-9)

	revealTick(em, houndBayShow)
	assert.Zero(t, h.BayShow, "the bay shows its time, then stops")

	revealTick(em, houndBayEvery-houndBayShow)
	assert.InDelta(t, houndBayShow, h.BayShow, 1e-9, "it bays again on its clock")

	hc, _ := hound.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	h.BayShow, h.BayIn = 0, 0
	revealTick(em, 0.05)
	assert.Zero(t, h.BayShow, "a hound down bays at nothing")
}

// The hound's bay does not reveal what it bays at: an undetected door stays
// undetected (the bay is the hint).
func TestBookReveal_TheBayRevealsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	houndAt(em, archer, 0, 0)
	door := secretDoorAt(em, testCell, 0)

	revealTick(em, 0.05)

	assert.False(t, detectableT(t, door).Detected)
}
