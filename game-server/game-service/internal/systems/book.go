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
* pageGates (Recall's someone to pull, Heave's block free to go) and
* pageCastGates (Pick the Lock's shut cage), or is
* refused with no effect, no cost and no cooldown. An instant page then pays
* its cost, starts its book cooldown (or is spent) and has its effect, through
* the resolver its page id names in pageResolvers. A page with a cast time
* starts casting
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
	BookGround
	PageEntryPoints
}

// BookGround is what a page reads of its world past the entities: the floor's
// ground and how a body moves over it. The session's; a test's stand-in.
type BookGround struct {
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
	// Footing is a dungeon floor's walkable cells, where a delver whose
	// afloat ends over a pit is set down (book_levitate.go). Nil off a
	// dungeon floor: no one is set down.
	Footing Footing
	// Cells is a dungeon floor's grid as a stone block reads and writes it:
	// Heave shoves a block over it as a push does (book_heave.go, R52). Nil
	// off a dungeon floor: nothing is shoved.
	Cells CellMask
}

// PageEntryPoints are the world's entry points a page's effect calls, each
// its own one-method port the page that calls it owns (pageEntries): the
// effect may be refused by the world, and the refusal is told. The
// session's; a test's stand-in.
type PageEntryPoints struct {
	// Contracts is the world's contract entry point, Take a Contract's effect
	// (book_contract.go). Nil takes none.
	Contracts ContractTaker
	// FarReach is the world's interact from a distance, Far Hand's effect
	// (book_far_hand.go, R50). Nil works nothing.
	FarReach FarReach
	// Cages is the world's open-cage entry point, Pick the Lock's effect
	// (book_pick_the_lock.go, R55). Nil opens none.
	Cages CageOpener
	// Hires is the world's hire entry point, Strike a Deal's effect
	// (book_strike_a_deal.go, R56). Nil hires none.
	Hires GroupHirer
}

// pageResolver has a page's effect, once its cast is accepted and paid for.
// world is the caster's, for an effect that sets down an entity of its own.
type pageResolver func(world *ecs.EntityManager, cast BookCast)

// pageResolvers holds the effect of every offered page, by page id. A page is
// added to the game by adding its resolver here. FS-X2CMM §K R59.
var pageResolvers = map[components.PageID]pageResolver{
	components.PageBindingGlyph: resolveBindingGlyph,
	components.PageBrew:         resolveBrew,
	components.PageCallTheHound: resolveCallTheHound,
	components.PageHardened:     resolveHardened,
	components.PageHeave:        resolveHeave,
	components.PageLevitate:     resolveLevitate,
	components.PageLongNight:    resolveLongNight,
	components.PageRecall:       resolveRecall,
	components.PageTrackersEye:  resolveTrackersEye,
	components.PageWitchlight:   resolveWitchlight,
}

// pageEntry has the effect of a page that is one of the world's entry
// points, which may refuse: it is had before the page is paid for, and a
// refusal refuses the cast with nothing spent.
type pageEntry func(cast BookCast) error

// pageEntries holds the effect of every offered page that is an entry point,
// by page id, as pageResolvers holds the rest.
var pageEntries = map[components.PageID]pageEntry{
	components.PageFarHand:       enterFarHand,
	components.PagePickTheLock:   enterPickTheLock,
	components.PageStrikeADeal:   enterStrikeADeal,
	components.PageTakeAContract: enterTakeAContract,
}

// pageInteractables holds, by page id, which entities an interactable page
// may name, where the page says (Far Hand's levers, chests, doors and traps,
// Heave's stone block); any other interactable page names an entity the
// world takes an interact on.
var pageInteractables = map[components.PageID]func(*ecs.Entity) bool{
	components.PageFarHand:     farHandTarget,
	components.PageHeave:       isStoneBlock,
	components.PagePickTheLock: isCage,
	components.PageStrikeADeal: isLivingEncounterNPC,
}

// interactableFor is whether target is one the interactable page may name.
func interactableFor(page components.PageID, target *ecs.Entity) bool {
	if takes, ok := pageInteractables[page]; ok {
		return takes(target)
	}
	return target.HasComponent(ecs.ComponentTypeInteractable)
}

// PageOffered is whether the server resolves the page: castable and sent.
func PageOffered(id components.PageID) bool {
	_, resolved := pageResolvers[id]
	_, entered := pageEntries[id]
	return resolved || entered
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
	components.PageHeave:  gateHeave,
	components.PageRecall: gateSomeoneToPull,
}

// pageCastGates are conditions a page's entry point judges as well, which the
// book judges at the cast only: refused there with nothing started and nothing
// told, and at completion left to the entry point, whose refusal is told. A
// Pick the Lock is aimed at a shut cage; one its key opened during the cast
// is the world's cage_open.
var pageCastGates = map[components.PageID]pageGate{
	components.PagePickTheLock: gateShutCage,
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
	if gate, ok := pageCastGates[cast.Page.ID]; ok {
		if err := gate(s.em, cast); err != nil {
			return err
		}
	}
	if cast.Page.CastTime > 0 {
		startCasting(cast, book)
		return nil
	}

	return s.resolve(cast, book)
}

// ownGate judges the cast against its page's own condition, if it has one.
func (s *BookSystem) ownGate(cast BookCast) error {
	if gate, ok := pageGates[cast.Page.ID]; ok {
		return gate(s.em, cast)
	}
	return nil
}

// resolve pays for an accepted page and has its effect; a page that is an
// entry point has it first, and the world's refusal comes back with nothing
// paid. Nothing here reads attack speed, starts the pin or touches a charge
// (R6–R7).
func (s *BookSystem) resolve(cast BookCast, book *components.BookComponent) error {
	if enter, ok := pageEntries[cast.Page.ID]; ok {
		if err := enter(cast); err != nil {
			return err
		}
	}
	if pool, ok := bookPool(cast.Caster); ok && cast.Page.Cost > 0 {
		pool.Current -= cast.Page.Cost
	}
	switch {
	case cast.Page.Limit != PageLimitNone:
		book.Spent[cast.Page.ID] = true
	case cast.Page.Cooldown > 0:
		book.Cooldowns[cast.Page.ID] = components.BookCooldown{Remaining: cast.Page.Cooldown, Total: cast.Page.Cooldown}
	}
	if resolver, ok := pageResolvers[cast.Page.ID]; ok {
		resolver(s.em, cast)
	}
	return nil
}

// Update is the books' tick, in simulation time: the floor's book effects
// first (ageBookEffects), then each drinker's draught heal, then every book
// run down. It runs before the monsters think, so a monster a rune caught
// stands from this tick. A delver whose afloat ends over a pit is set down
// on ground's footing. FS-X2CMM §A R8, §E R21, R24, R27, §J R51.
func (s *BookSystem) Update(deltaTime float64, entities []*ecs.Entity, ground BookGround) {
	s.ageBookEffects(deltaTime, entities)
	s.healDraughts(deltaTime, entities)
	runDownBooks(deltaTime, entities, ground)
}

// stateComponents is the component a timed book state keeps on its delver,
// taken off when the state ends.
var stateComponents = map[components.BookStateName]ecs.ComponentType{
	components.BookStateLongNight: ecs.ComponentTypeLongNight,
	components.BookStateDraught:   ecs.ComponentTypeDraughtHeal,
}

// runDownBooks runs every book down by the tick: its book cooldowns and its
// timed states, each gone once its time is up, a state's own component with
// it, and an afloat ended over a pit sets its delver down. A book's run
// across floors.
func runDownBooks(deltaTime float64, entities []*ecs.Entity, ground BookGround) {
	for _, entity := range entities {
		book, ok := bookOf(entity)
		if !ok {
			continue
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
				if kept, ok := stateComponents[name]; ok {
					entity.RemoveComponent(kept)
				}
				if name == components.BookStateAfloat {
					setDownOffPit(entities, entity, ground)
				}
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
		if cast.Target == nil || !interactableFor(cast.Page.ID, cast.Target) {
			return ErrBadPageTarget
		}
	default:
		return ErrBadPageTarget
	}
	x, y, ok := TargetMiddle(cast.Target)
	if !ok || !inPageRange(cast, x, y) {
		return ErrBadPageTarget
	}
	return nil
}

// inPageRange is whether (x, y) lies within the page's range of the caster.
func inPageRange(cast BookCast, x, y float64) bool {
	from, ok := bodyCentre(cast.Caster)
	if !ok {
		return false
	}
	return math.Hypot(x-from.X, y-from.Y) <= cast.Page.RangeCells*cast.CellSize
}

// --- the resolvers (§E) ---

// hardenedSeconds is how long the Scar of the Pit's hardened lasts (R30).
const hardenedSeconds = 10.0

// resolveHardened sets hardened on the warrior: while it runs, traps deal
// them nothing and no poisoning takes hold (R53, Hardened).
func resolveHardened(_ *ecs.EntityManager, cast BookCast) {
	setBookState(cast.Caster, components.BookStateHardened, hardenedSeconds)
}

// trackersEyeSeconds is how long Tracker's Eye lasts (R26).
const trackersEyeSeconds = 15.0

// resolveTrackersEye sets tracker's eye on the archer. While it runs, every
// secret door and trap within 10 cells of them is revealed (R49,
// BookRevealSystem).
func resolveTrackersEye(_ *ecs.EntityManager, cast BookCast) {
	setBookState(cast.Caster, components.BookStateTrackersEye, trackersEyeSeconds)
}

// afloatSeconds is how long a Levitate keeps its target afloat (R23).
const afloatSeconds = 8.0

// resolveLevitate makes the cast's target afloat, the mage themself or an
// ally; a second Levitate restarts the 8 s. While afloat they cross a
// chasm's pits and fire no trap (R51, book_levitate.go).
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

func bodyCentre(entity *ecs.Entity) (*components.TransformComponent, bool) {
	tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return nil, false
	}
	return tc.(*components.TransformComponent), true
}

// TargetMiddle is where a page's range is measured to on its target: a body's
// centre, or, for a door stored by its top-left corner, its doorway's middle,
// as an interact's reach is measured. Far Hand's interact is reached from it.
func TargetMiddle(entity *ecs.Entity) (x, y float64, ok bool) {
	at, ok := bodyCentre(entity)
	if !ok {
		return 0, 0, false
	}
	x, y = at.X, at.Y
	if dc, isDoor := entity.GetComponent(ecs.ComponentTypeDoor); isDoor {
		door := dc.(*components.DoorComponent)
		x, y = x+door.Width/2, y+door.Height/2
	}
	return x, y, true
}

// delverLevel is the character's level in play, 1 when unknown.
func delverLevel(entity *ecs.Entity) int {
	if sc, ok := entity.GetComponent(ecs.ComponentTypeStats); ok {
		return max(sc.(*components.StatsComponent).Level, 1)
	}
	return 1
}
