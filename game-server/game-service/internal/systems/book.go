package systems

import (
	"errors"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* The BookSystem judges and resolves book abilities, and runs down what they
* leave on a delver's book: its book cooldowns and its timed book states.
*
* A cast passes every gate in bookGates, in order, then its page's own in
* pageGates (Recall's someone to pull), or is refused with no
* effect, no cost and no cooldown. An instant page then pays its cost, starts
* its book cooldown (or is spent) and has its effect, through the resolver its
* page id names in pageResolvers. A page with a cast time starts casting
* instead, and is paid for and has its effect when its cast completes
* (book_casting.go). A page is offered exactly when it has a
* resolver: the rest of the table is refused as a locked page is and never
* sent. Book abilities start no pin, are not paced by worn attack speed and end
* no charge. FS-X2CMM §A R4–R8, §K R59.
**/

// Why a page cast is refused. None reaches the client (FS-8AY7S R10).
var (
	ErrPageNotInBook   = errors.New("the caster's book has no such page")
	ErrPageLocked      = errors.New("page locked at the caster's level")
	ErrPageNotOffered  = errors.New("page not offered")
	ErrCasterOutOfPlay = errors.New("caster not in play")
	ErrCasterPinned    = errors.New("caster pinned")
	ErrPageNotReady    = errors.New("page on its cooldown or spent")
	ErrShortOfCost     = errors.New("caster short of the page's cost")
	ErrBadPageTarget   = errors.New("target does not fit the page or is out of range")
	ErrAlreadyCasting  = errors.New("caster already casting a page")
	ErrNoOneToPull     = errors.New("no teammate in play to recall")
)

// BookCast is one page cast as the tick takes it: the page, its caster, and
// its target as the page's target kind needs it. FS-X2CMM §C R13.
type BookCast struct {
	Caster *ecs.Entity
	Page   BookPage
	// TargetX and TargetY are the cast's point, in px (ground pages).
	TargetX, TargetY float64
	// Target is the cast's entity (ally and interactable pages); nil when the
	// cast named none, or none in this world.
	Target *ecs.Entity
	// CellSize is the floor's cell edge in px, the unit of every range.
	CellSize float64
	BookWorld
}

// BookWorld is what a page reads of its world past the entities: the floor's
// ground and how a body moves over it. The session's; a test's stand-in.
type BookWorld struct {
	// Walkable is whether a point is ground a body could stand on, not rock
	// or a wall: a ground page's point must be (R14). Nil walks nowhere.
	Walkable func(x, y float64) bool
	// Ground is where a straight move from the caster lands, as a blink's
	// does: Recall stands a teammate only where it reaches (R25). Nil lands
	// nowhere.
	Ground Ground
	// EndCharge ends a body's charge in flight where it stands, as a blink
	// does before it moves its caster (CombatSystem.EndCharge). Nil only
	// stops it.
	EndCharge func(entity *ecs.Entity)
}

// pageResolver has a page's effect, once its cast is accepted and paid for.
// world is the caster's, for an effect that sets down an entity of its own.
type pageResolver func(world *ecs.EntityManager, cast BookCast)

// pageResolvers holds the effect of every offered page, by page id. A page is
// added to the game by adding its resolver here. FS-X2CMM §K R59.
var pageResolvers = map[components.PageID]pageResolver{
	components.PageBindingGlyph: resolveBindingGlyph,
	components.PageBrew:         resolveBrew,
	components.PageHardened:     resolveHardened,
	components.PageLevitate:     resolveLevitate,
	components.PageLongNight:    resolveLongNight,
	components.PageRecall:       resolveRecall,
	components.PageTrackersEye:  resolveTrackersEye,
	components.PageWitchlight:   resolveWitchlight,
}

// PageOffered is whether the server resolves the page: castable and sent.
func PageOffered(id components.PageID) bool {
	_, ok := pageResolvers[id]
	return ok
}

// bookGate refuses a cast that does not meet one condition of R4.
type bookGate func(cast BookCast, book *components.BookComponent) error

// bookGates are R4's conditions, in the order a cast meets them.
var bookGates = []bookGate{
	gateInBook,
	gateUnlocked,
	gateOffered,
	gateInPlay,
	gatePinned,
	gateNotCasting,
	gateReady,
	gateCost,
	gateTarget,
}

// pageGate refuses a cast that does not meet a condition one page adds to
// R4's, judged with the world in hand.
type pageGate func(world *ecs.EntityManager, cast BookCast) error

// pageGates are the conditions a page adds, judged after bookGates at the
// cast and again at its completion (R17).
var pageGates = map[components.PageID]pageGate{
	components.PageRecall: gateSomeoneToPull,
}

// BookSystem works on one world's books and the book effects on its floor.
type BookSystem struct {
	em *ecs.EntityManager
}

func NewBookSystem(em *ecs.EntityManager) *BookSystem {
	return &BookSystem{em: em}
}

// Cast judges the cast against every gate and, for an instant page, resolves
// it on this tick: its cost paid, its book cooldown started or its use spent,
// its effect had. A page with a cast time starts casting instead (§D R16). A
// refused cast changes nothing. FS-X2CMM §A R4–R6.
func (s *BookSystem) Cast(cast BookCast) error {
	book, ok := bookOf(cast.Caster)
	if !ok {
		return ErrPageNotInBook
	}
	for _, gate := range bookGates {
		if err := gate(cast, book); err != nil {
			return err
		}
	}
	if err := s.ownGate(cast); err != nil {
		return err
	}
	if cast.Page.CastTime > 0 {
		startCasting(cast, book)
		return nil
	}

	s.resolve(cast, book)
	return nil
}

// ownGate judges the cast against its page's own condition, if it has one.
func (s *BookSystem) ownGate(cast BookCast) error {
	if gate, ok := pageGates[cast.Page.ID]; ok {
		return gate(s.em, cast)
	}
	return nil
}

// resolve pays for an accepted page and has its effect. Nothing here reads
// attack speed, starts the pin or touches a charge (R6–R7).
func (s *BookSystem) resolve(cast BookCast, book *components.BookComponent) {
	if pool, ok := bookPool(cast.Caster); ok && cast.Page.Cost > 0 {
		pool.Current -= cast.Page.Cost
	}
	switch {
	case cast.Page.Limit != PageLimitNone:
		book.Spent[cast.Page.ID] = true
	case cast.Page.Cooldown > 0:
		book.Cooldowns[cast.Page.ID] = components.BookCooldown{Remaining: cast.Page.Cooldown, Total: cast.Page.Cooldown}
	}
	pageResolvers[cast.Page.ID](s.em, cast)
}

// Update runs every book down by the tick: its book cooldowns and its timed
// states, each gone once its time is up, and a drunk draught's heal; and the
// floor's book effects, each taken from the world once its time is up. A rune
// first catches what stands on it, and goes on its third catch. It runs
// before the monsters think, so a monster caught stands from this tick. Simulation time; a book's across
// floors. FS-X2CMM §A R8, §E R21, R24, R27.
func (s *BookSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		if s.catchOnRune(entity, entities) {
			continue // spent on its third catch, and gone
		}
		s.ageBookEffect(entity, deltaTime)
		book, ok := bookOf(entity)
		if !ok {
			continue
		}
		if book.Draught != nil {
			healDraught(entity, book, deltaTime)
		}
		for id, cooldown := range book.Cooldowns {
			if cooldown.Remaining -= deltaTime; cooldown.Remaining <= 0 {
				delete(book.Cooldowns, id)
				continue
			}
			book.Cooldowns[id] = cooldown
		}
		for name, left := range book.States {
			if left -= deltaTime; left <= 0 {
				delete(book.States, name)
				continue
			}
			book.States[name] = left
		}
	}
}

// ReadyBookForNewFloor makes the delver's once-per-floor pages ready again as
// the party climbs, and ends a cast in progress with nothing (§D R18). Book
// cooldowns run on and once-per-delve pages stay spent. FS-X2CMM §A R8.
func ReadyBookForNewFloor(entity *ecs.Entity) {
	book, ok := bookOf(entity)
	if !ok {
		return
	}
	book.Casting = nil
	for id := range book.Spent {
		if page, ok := classBooks[id]; ok && page.Limit == PageLimitPerFloor {
			delete(book.Spent, id)
		}
	}
}

// --- the gates (R4) ---

func gateInBook(cast BookCast, book *components.BookComponent) error {
	if !book.Has(cast.Page.ID) {
		return ErrPageNotInBook
	}
	return nil
}

// gateUnlocked reads the level on every cast, so a level-up mid-run unlocks a
// page on the next tick (R3).
func gateUnlocked(cast BookCast, _ *components.BookComponent) error {
	if delverLevel(cast.Caster) < cast.Page.UnlockLevel {
		return ErrPageLocked
	}
	return nil
}

func gateOffered(cast BookCast, _ *components.BookComponent) error {
	if !PageOffered(cast.Page.ID) {
		return ErrPageNotOffered
	}
	return nil
}

func gateInPlay(cast BookCast, _ *components.BookComponent) error {
	if !InPlay(cast.Caster) {
		return ErrCasterOutOfPlay
	}
	return nil
}

// gatePinned: every cast but the parry is refused while pinned (FS-JS7C8).
func gatePinned(cast BookCast, _ *components.BookComponent) error {
	if cast.Caster.HasComponent(ecs.ComponentTypeAttackPin) {
		return ErrCasterPinned
	}
	return nil
}

func gateReady(cast BookCast, book *components.BookComponent) error {
	if book.Spent[cast.Page.ID] || book.Cooldowns[cast.Page.ID].Remaining > 0 {
		return ErrPageNotReady
	}
	return nil
}

// gateCost: a page's whole cost in the class resource; a page costing
// nothing (the mercenary's) spends no parry charge (R11).
func gateCost(cast BookCast, _ *components.BookComponent) error {
	if cast.Page.Cost == 0 {
		return nil
	}
	if pool, ok := bookPool(cast.Caster); !ok || pool.Current < cast.Page.Cost {
		return ErrShortOfCost
	}
	return nil
}

// gateTarget judges the target against the page's target kind and range on
// the tick the cast is taken, from the caster's centre, never clamped.
// FS-X2CMM §C R13–R15.
func gateTarget(cast BookCast, _ *components.BookComponent) error {
	switch cast.Page.Target {
	case TargetSelf, TargetNone:
		return nil
	case TargetGround:
		if cast.Walkable == nil || !cast.Walkable(cast.TargetX, cast.TargetY) {
			return ErrBadPageTarget
		}
		if !inPageRange(cast, cast.TargetX, cast.TargetY) {
			return ErrBadPageTarget
		}
		return nil
	case TargetAlly:
		if cast.Target != nil && cast.Target.ID == cast.Caster.ID {
			if cast.Page.AllowsSelf {
				return nil
			}
			return ErrBadPageTarget
		}
		if cast.Target == nil || !InPlay(cast.Target) {
			return ErrBadPageTarget
		}
	case TargetInteractable:
		if cast.Target == nil || !cast.Target.HasComponent(ecs.ComponentTypeInteractable) {
			return ErrBadPageTarget
		}
	default:
		return ErrBadPageTarget
	}
	at, ok := centreOf(cast.Target)
	if !ok || !inPageRange(cast, at.X, at.Y) {
		return ErrBadPageTarget
	}
	return nil
}

// inPageRange is whether (x, y) lies within the page's range of the caster.
func inPageRange(cast BookCast, x, y float64) bool {
	from, ok := centreOf(cast.Caster)
	if !ok {
		return false
	}
	return math.Hypot(x-from.X, y-from.Y) <= cast.Page.RangeCells*cast.CellSize
}

// --- the resolvers (§E) ---

// hardenedSeconds is how long the Scar of the Pit's hardened lasts (R30).
const hardenedSeconds = 10.0

// resolveHardened sets hardened on the warrior. Its trap and poison immunity
// is wave 2 (R53).
func resolveHardened(_ *ecs.EntityManager, cast BookCast) {
	setBookState(cast.Caster, components.BookStateHardened, hardenedSeconds)
}

// trackersEyeSeconds is how long Tracker's Eye lasts (R26).
const trackersEyeSeconds = 15.0

// resolveTrackersEye sets tracker's eye on the archer. Its reveal is wave 2
// (R49).
func resolveTrackersEye(_ *ecs.EntityManager, cast BookCast) {
	setBookState(cast.Caster, components.BookStateTrackersEye, trackersEyeSeconds)
}

// afloatSeconds is how long a Levitate keeps its target afloat (R23).
const afloatSeconds = 8.0

// resolveLevitate makes the cast's target afloat, the mage themself or an
// ally; a second Levitate restarts the 8 s. Crossing chasms and not firing
// traps are wave 2 (R51).
func resolveLevitate(_ *ecs.EntityManager, cast BookCast) {
	setBookState(cast.Target, components.BookStateAfloat, afloatSeconds)
}

// afloat is whether the delver is afloat: every attack row, the class ability
// and the tree ability are refused while it runs; book abilities and the
// potion are not (R23). The CombatSystem reads it where it refuses a pinned
// cast (resolve) and where it raises the parry stance (stepStance).
func afloat(entity *ecs.Entity) bool {
	book, ok := bookOf(entity)
	if !ok {
		return false
	}
	_, on := book.States[components.BookStateAfloat]
	return on
}

// setBookState sets (or restarts) a timed book state on a delver.
func setBookState(entity *ecs.Entity, name components.BookStateName, seconds float64) {
	if book, ok := bookOf(entity); ok {
		book.States[name] = seconds
	}
}

// --- readers ---

func bookOf(entity *ecs.Entity) (*components.BookComponent, bool) {
	if entity == nil {
		return nil, false
	}
	bc, ok := entity.GetComponent(ecs.ComponentTypeBook)
	if !ok {
		return nil, false
	}
	return bc.(*components.BookComponent), true
}

func bookPool(entity *ecs.Entity) (*components.ResourceComponent, bool) {
	rc, ok := entity.GetComponent(ecs.ComponentTypeResource)
	if !ok {
		return nil, false
	}
	return rc.(*components.ResourceComponent), true
}

func centreOf(entity *ecs.Entity) (*components.TransformComponent, bool) {
	tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return nil, false
	}
	return tc.(*components.TransformComponent), true
}

// delverLevel is the character's level in play, 1 when unknown.
func delverLevel(entity *ecs.Entity) int {
	if sc, ok := entity.GetComponent(ecs.ComponentTypeStats); ok {
		return max(sc.(*components.StatsComponent).Level, 1)
	}
	return 1
}
