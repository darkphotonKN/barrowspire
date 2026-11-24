package components

import (
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// PageID names a page of a class book. Each is a cast_skill id of its own,
// mapped to no attack kind. FS-X2CMM §A R2, §B R9–R12.
type PageID string

const (
	// the mage's Spellbook
	PageWitchlight   PageID = "witchlight"
	PageFarHand      PageID = "far_hand"
	PageLevitate     PageID = "levitate"
	PageBindingGlyph PageID = "binding_glyph"
	PageRecall       PageID = "recall"
	// the archer's Hunter's Journal
	PageTrackersEye  PageID = "trackers_eye"
	PageBrew         PageID = "brew"
	PageCallTheHound PageID = "call_the_hound"
	// the mercenary's The Ledger
	PagePickTheLock   PageID = "pick_the_lock"
	PageStrikeADeal   PageID = "strike_a_deal"
	PageTakeAContract PageID = "take_a_contract"
	// the warrior's Scars. The Long Night is never last_stand: that is the
	// Guardian's saving rule (LastStandSpentComponent).
	PageHeave     PageID = "heave"
	PageHardened  PageID = "hardened"
	PageLongNight PageID = "long_night"
)

// BookStateName names a timed state a book ability sets on a delver. The wire
// carries the same strings, on the delver's own state and everyone else's.
// FS-X2CMM §F R34.
type BookStateName string

const (
	// BookStateHardened is the Scar of the Pit's 10 s self state (R30).
	BookStateHardened BookStateName = "hardened"
	// BookStateAfloat is the 8 s state Levitate sets on its target: no
	// attack, class ability or tree ability while it runs (R23).
	BookStateAfloat BookStateName = "afloat"
	// BookStateTrackersEye is Tracker's Eye's 15 s self state (R26). Its
	// reveal is wave 2 (R49).
	BookStateTrackersEye BookStateName = "trackers_eye"
	// BookStateLongNight is the Scar of the Long Night's 6 s self state:
	// monsters within 5 cells turn on the warrior, who takes 30 % less from
	// every hit (R31). Never last_stand. Its reach is the warrior's
	// LongNightComponent.
	BookStateLongNight BookStateName = "long_night"
	// BookStateDraught is on a delver for the 6 s a drunk draught heals them
	// (R27); its heal is the delver's DraughtHealComponent.
	BookStateDraught BookStateName = "draught"
)

// BookCooldown is one page's book cooldown, in simulation seconds: Remaining
// left before it is ready, Total the table's length it started at.
type BookCooldown struct {
	Remaining float64
	Total     float64
}

// BookComponent is a delver's class book in this world: the pages their class
// names, in book order, and what casting them has left running. A run seats a
// fresh one, so every page is ready when a run starts. The BookSystem runs it
// down; it holds no behaviour. FS-X2CMM §A R1, R8.
type BookComponent struct {
	// Pages is the class's book, in book order (ClassConfig.Book).
	Pages []PageID
	// Cooldowns is each page whose book cooldown runs; a ready page has none.
	Cooldowns map[PageID]BookCooldown
	// Spent is each once-per-floor or once-per-delve page already used.
	Spent map[PageID]bool
	// States is each timed book state on this delver, by its seconds left.
	States map[BookStateName]float64
	// Casting is the page being cast, nil when none: one at a time (§D R19).
	Casting *BookCasting
}

// BookCasting is a page cast in progress: accepted, not yet paid for, its
// effect to come once its cast time has run out. Where the caster stood and
// the health they took into the last combat are what a move or a hit is read
// against, as a timed open's are (FS-MQYEX D3–D4). FS-X2CMM §D R16–R18.
type BookCasting struct {
	Page PageID
	// Elapsed is the simulation seconds counted so far, 0 when taken, the
	// cast's own tick counted; Total the page's cast time.
	Elapsed, Total float64
	// FromX, FromY is where the caster stood when the cast was taken.
	FromX, FromY float64
	// HealthBeforeCombat is the health the caster took into the last combat
	// the cast saw: less than it afterwards is a hit that cost health.
	HealthBeforeCombat int
	// TargetX, TargetY is the cast's point (ground pages); TargetID its
	// entity (ally and interactable pages), uuid.Nil when it named none.
	TargetX, TargetY float64
	TargetID         uuid.UUID
	// CellSize is the floor's cell edge the cast was judged in.
	CellSize float64
}

func (b *BookComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeBook
}

// NewBookComponent is a fresh book of the pages given, its own copy of them:
// no world shares a book's pages with another.
func NewBookComponent(pages []PageID) *BookComponent {
	return &BookComponent{
		Pages:     slices.Clone(pages),
		Cooldowns: make(map[PageID]BookCooldown),
		Spent:     make(map[PageID]bool),
		States:    make(map[BookStateName]float64),
	}
}

// Has is whether the book holds the page.
func (b *BookComponent) Has(page PageID) bool {
	for _, held := range b.Pages {
		if held == page {
			return true
		}
	}
	return false
}
