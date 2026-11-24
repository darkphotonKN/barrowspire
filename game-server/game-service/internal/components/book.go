package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

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
	// afloat (R23), trackers_eye (R26) and long_night (R31) join here as
	// their pages are built.
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
	// Casting (the page being cast, its time left and total) joins here with
	// cast time (FS-X2CMM §D).
}

func (b *BookComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeBook
}

func NewBookComponent(pages []PageID) *BookComponent {
	return &BookComponent{
		Pages:     pages,
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
