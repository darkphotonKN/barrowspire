package systems

import (
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

// TargetKind is what a page is aimed at. FS-X2CMM §C R13.
type TargetKind string

const (
	// TargetGround is a point within range: the cast's target point.
	TargetGround TargetKind = "ground"
	// TargetAlly is a living teammate within range, or the caster where the
	// page allows self: the cast's target entity id.
	TargetAlly TargetKind = "ally"
	// TargetInteractable is a Spire entity within range: the cast's target
	// entity id.
	TargetInteractable TargetKind = "interactable"
	// TargetSelf and TargetNone ignore both.
	TargetSelf TargetKind = "self"
	TargetNone TargetKind = "none"
)

// PageLimit is how often a page without a cooldown may be cast.
type PageLimit string

const (
	// PageLimitNone: the page has a book cooldown instead.
	PageLimitNone PageLimit = ""
	// PageLimitPerFloor is spent until the party climbs. FS-X2CMM §A R8.
	PageLimitPerFloor PageLimit = "per_floor"
	// PageLimitPerDelve is spent for the rest of the run. FS-X2CMM §A R8.
	PageLimitPerDelve PageLimit = "per_delve"
)

// adjacentCells is "adjacent": within 1.5 cells of the caster's centre, so
// diagonal neighbours count. FS-X2CMM §B R12.
const adjacentCells = 1.5

// BookPage is one page of a class book, as data: what it is aimed at and how
// far, how long it takes, what it costs in the class resource and how often
// it may be cast. Range is in cells of the floor; times in seconds.
// FS-X2CMM §A R1.
type BookPage struct {
	ID          components.PageID
	Class       string
	UnlockLevel int
	Target      TargetKind
	// AllowsSelf lets an ally page be cast on its caster (Levitate, R15).
	AllowsSelf bool
	RangeCells float64
	CastTime   float64
	Cost       int
	// Cooldown is the book cooldown; 0 for a page with a Limit instead.
	Cooldown float64
	Limit    PageLimit
}

// classBooks is every page of every class book, the one source for resolving
// and for the wire. Which of them are offered is pageResolvers'.
// FS-X2CMM §B R9–R12.
var classBooks = map[components.PageID]BookPage{
	// mage, Spellbook (mana), R9
	components.PageWitchlight:   {Class: "mage", UnlockLevel: 2, Target: TargetGround, RangeCells: 8, CastTime: 1, Cost: 20, Cooldown: 45},
	components.PageFarHand:      {Class: "mage", UnlockLevel: 5, Target: TargetInteractable, RangeCells: 6, CastTime: 1, Cost: 15, Cooldown: 30},
	components.PageLevitate:     {Class: "mage", UnlockLevel: 9, Target: TargetAlly, AllowsSelf: true, RangeCells: 6, CastTime: 1.5, Cost: 35, Cooldown: 90},
	components.PageBindingGlyph: {Class: "mage", UnlockLevel: 13, Target: TargetGround, RangeCells: 6, CastTime: 2.5, Cost: 40, Cooldown: 60},
	components.PageRecall:       {Class: "mage", UnlockLevel: 17, Target: TargetNone, CastTime: 3, Cost: 50, Limit: PageLimitPerFloor},
	// archer, Hunter's Journal (stamina), R10
	components.PageTrackersEye:  {Class: "archer", UnlockLevel: 3, Target: TargetNone, Cost: 20, Cooldown: 60},
	components.PageBrew:         {Class: "archer", UnlockLevel: 9, Target: TargetNone, CastTime: 3, Cost: 30, Cooldown: 120},
	components.PageCallTheHound: {Class: "archer", UnlockLevel: 15, Target: TargetGround, RangeCells: 4, CastTime: 2, Cost: 40, Cooldown: 180},
	// mercenary, The Ledger (no resource cost), R11
	components.PagePickTheLock:   {Class: "mercenary", UnlockLevel: 3, Target: TargetInteractable, RangeCells: adjacentCells, CastTime: 4, Cooldown: 30},
	components.PageStrikeADeal:   {Class: "mercenary", UnlockLevel: 9, Target: TargetInteractable, RangeCells: 4, CastTime: 2, Cooldown: 900},
	components.PageTakeAContract: {Class: "mercenary", UnlockLevel: 15, Target: TargetNone, Limit: PageLimitPerDelve},
	// warrior, Scars (stamina), R12
	components.PageHeave:     {Class: "warrior", UnlockLevel: 3, Target: TargetInteractable, RangeCells: adjacentCells, CastTime: 2, Cost: 25, Cooldown: 20},
	components.PageHardened:  {Class: "warrior", UnlockLevel: 9, Target: TargetSelf, Cost: 30, Cooldown: 90},
	components.PageLongNight: {Class: "warrior", UnlockLevel: 15, Target: TargetSelf, Cost: 40, Cooldown: 120},
}

func init() {
	// the id is the key; set once so a row never names another page
	for id, page := range classBooks {
		page.ID = id
		classBooks[id] = page
	}
}

// BookPageOf is the page a cast_skill id names, false when it names none.
func BookPageOf(skillID string) (BookPage, bool) {
	page, ok := classBooks[components.PageID(skillID)]
	return page, ok
}

// AllPageIDs is every page of the table, sorted.
func AllPageIDs() []components.PageID {
	ids := make([]components.PageID, 0, len(classBooks))
	for id := range classBooks {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids
}
