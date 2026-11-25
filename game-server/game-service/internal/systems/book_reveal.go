package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Reveal and the hound's bay (FS-X2CMM §J R49, as reconciled at wave 2 against
* the Spire's floors). There are no hidden switches: what a page reveals is a
* secret door or a trap, a tripwire among them.
*
* While a witchlight burns, every secret door and trap with a spot within 3
* cells of its centre is detected for the party (FS-5FZ4J R30, R38) and marked
* revealed, so its wire entry says revealed: true; while tracker's eye runs on
* an archer in play, every one within 10 cells of the archer is. A thing a
* delver already walked near (detected, not revealed) is revealed too when a
* page reaches it: revealed is the page's mark, which the client draws apart
* from a thing only come upon. Nothing un-reveals: a reveal lasts the floor's
* life, as a detection does.
*
* A standing hound bays at the nearest thing it bays at within 6 cells of it
* (bayCalls): a shut secret door, detected or not, and a seal piece or tripwire
* whose ambush has not woken. A bay shows on the hound's wire entry toward that
* thing for houndBayShow, and the hound bays again every houndBayEvery while
* one is near. It reveals nothing, but it does point at an undetected door or
* tripwire: that hint is what baying is for. Nothing concealed (in a shut
* hidden room) is bayed at, so the bay never names a hidden room's contents.
*
* It runs on the tick beside the Spire's DetectionSystem, so a reveal and a
* bay are on that tick's wire.
**/

const (
	// witchlightRevealCells is how far from a witchlight's centre it reveals.
	witchlightRevealCells = 3.0
	// trackersEyeRevealCells is how far from the archer tracker's eye reveals.
	trackersEyeRevealCells = 10.0
	// houndBayCells is how near something must be for the hound to bay at it.
	houndBayCells = 6.0
	// houndBayShow is how long a bay shows on the wire; houndBayEvery the
	// seconds from one bay to the next while something is near.
	houndBayShow  = 1.5
	houndBayEvery = 4.0
)

// BookRevealSystem reveals what the floor's witchlights and tracker's eyes
// reach, and lets each hound bay. CellSize is the floor's cell edge in px.
type BookRevealSystem struct {
	CellSize float64
}

func NewBookRevealSystem(cellSize float64) *BookRevealSystem {
	return &BookRevealSystem{CellSize: cellSize}
}

// Update reveals, then bays, this tick.
func (s *BookRevealSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	s.reveal(entities)
	s.bay(deltaTime, entities)
}

// revealer is a place a page reveals from and how far it reaches, in px.
type revealer struct {
	x, y, reach float64
}

// reveal detects and reveals every detectable thing a revealer reaches.
func (s *BookRevealSystem) reveal(entities []*ecs.Entity) {
	revealers := s.revealers(entities)
	if len(revealers) == 0 {
		return
	}
	for _, e := range entities {
		dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
		if !ok {
			continue
		}
		d := dc.(*components.DetectableComponent)
		if !d.Revealed && reaches(revealers, d.Spots) {
			d.Detected, d.Revealed = true, true
		}
	}
}

// revealers are this tick's: every burning witchlight, and every archer in
// play with tracker's eye running.
func (s *BookRevealSystem) revealers(entities []*ecs.Entity) []revealer {
	var set []revealer
	for _, e := range entities {
		at, ok := bodyCentre(e)
		if !ok {
			continue
		}
		if witchlightBurning(e) {
			set = append(set, revealer{at.X, at.Y, witchlightRevealCells * s.CellSize})
		}
		if trackersEye(e) && InPlay(e) {
			set = append(set, revealer{at.X, at.Y, trackersEyeRevealCells * s.CellSize})
		}
	}
	return set
}

// reaches is whether any revealer reaches any of the spots.
func reaches(revealers []revealer, spots []components.Spot) bool {
	for _, r := range revealers {
		for _, spot := range spots {
			if math.Hypot(spot.X-r.x, spot.Y-r.y) <= r.reach {
				return true
			}
		}
	}
	return false
}

func witchlightBurning(e *ecs.Entity) bool {
	ec, ok := e.GetComponent(ecs.ComponentTypeBookEffect)
	return ok && ec.(*components.BookEffectComponent).Kind == components.BookEffectWitchlight && !BookEffectExpired(e)
}

// trackersEye is whether tracker's eye runs on the delver (R26).
func trackersEye(e *ecs.Entity) bool {
	book, ok := bookOf(e)
	if !ok {
		return false
	}
	_, on := book.States[components.BookStateTrackersEye]
	return on
}

// --- the hound's bay ---

// bayCall is one kind of thing a hound bays at: the spots it bays toward,
// false for anything not of its kind. A new kind joins bayCalls as a line.
type bayCall func(e *ecs.Entity) ([]components.Spot, bool)

// bayCalls is everything a hound bays at.
var bayCalls = []bayCall{shutSecretDoor, waitingAmbush}

// shutSecretDoor bays at a secret door while it is shut, detected or not, at
// its cells.
func shutSecretDoor(e *ecs.Entity) ([]components.Spot, bool) {
	bc, ok := e.GetComponent(ecs.ComponentTypeBarrier)
	if !ok || bc.(*components.BarrierComponent).Kind != components.BarrierSecretDoor {
		return nil, false
	}
	if oc, ok := e.GetComponent(ecs.ComponentTypeOpenable); ok && oc.(*components.OpenableComponent).IsOpen {
		return nil, false
	}
	dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
	if !ok {
		return nil, false
	}
	return dc.(*components.DetectableComponent).Spots, true
}

// waitingAmbush bays at a seal piece or a tripwire whose ambush has not woken,
// where it stands.
func waitingAmbush(e *ecs.Entity) ([]components.Spot, bool) {
	ac, ok := e.GetComponent(ecs.ComponentTypeAmbush)
	if !ok || ac.(*components.AmbushComponent).Woken {
		return nil, false
	}
	at, ok := bodyCentre(e)
	if !ok {
		return nil, false
	}
	return []components.Spot{{X: at.X, Y: at.Y}}, true
}

// baysAt is the spot the hound at at bays toward: the nearest spot of what it
// bays at within reach, the lower entity id at a tie; false with none. Nothing
// concealed counts.
func baysAt(at *components.TransformComponent, reach float64, entities []*ecs.Entity) (components.Spot, bool) {
	var best components.Spot
	var bestEntity *ecs.Entity
	bestDistance := math.Inf(1)
	for _, e := range entities {
		if e.HasComponent(ecs.ComponentTypeConcealed) {
			continue
		}
		for _, call := range bayCalls {
			spots, ok := call(e)
			if !ok {
				continue
			}
			for _, spot := range spots {
				d := math.Hypot(spot.X-at.X, spot.Y-at.Y)
				if d <= reach && (bestEntity == nil || nearerFirst(d, e.ID, bestDistance, bestEntity.ID) < 0) {
					best, bestEntity, bestDistance = spot, e, d
				}
			}
		}
	}
	return best, bestEntity != nil
}

// bay runs every hound's bay clock down, and lets every standing hound whose
// clock is out bay at the nearest thing it bays at.
func (s *BookRevealSystem) bay(deltaTime float64, entities []*ecs.Entity) {
	reach := houndBayCells * s.CellSize
	for _, e := range entities {
		hound, ok := HoundOf(e)
		if !ok {
			continue
		}
		hound.BayIn = max(hound.BayIn-deltaTime, 0)
		hound.BayShow = max(hound.BayShow-deltaTime, 0)
		if !standingHound(e) || hound.BayIn > castEpsilon {
			continue
		}
		at, ok := bodyCentre(e)
		if !ok {
			continue
		}
		if spot, ok := baysAt(at, reach, entities); ok {
			hound.BayAt, hound.BayShow, hound.BayIn = spot, houndBayShow, houndBayEvery
		}
	}
}

// Baying is whether the hound's bay shows this tick, and toward where.
func Baying(hound *components.HoundComponent) (components.Spot, bool) {
	return hound.BayAt, hound.BayShow > castEpsilon
}
