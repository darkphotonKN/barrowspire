package types

import "github.com/google/uuid"

// BookState is a delver's class book as its owner is told it, in a run only:
// the offered pages of their class's book, in book order, locked ones
// included. FS-X2CMM §F R32.
type BookState struct {
	Pages []BookPageState `json:"pages"`
	// Casting is the page the owner is casting; absent while none. §D, R32.
	Casting *BookCastingState `json:"casting,omitempty"`
}

// BookCastingState is a cast in progress as its caster is told it: the page,
// the seconds of cast time left and the whole cast time. FS-X2CMM §F R32.
type BookCastingState struct {
	Page      string  `json:"page"`
	Remaining float64 `json:"remaining"`
	Total     float64 `json:"total"`
}

// BookEffectState is a book effect on the floor as every recipient of the run
// is told it: its entity id, its kind (witchlight, rune, draught), where it
// stands in px and its seconds left. A draught has no time of its own (it
// stands until drunk), so its remaining is always 0; its id is what an
// interact names to drink it. A kind that shows more (a rune's catches, a
// hound's health) adds its own fields, absent on every other kind.
// FS-X2CMM §F R34.
type BookEffectState struct {
	ID        uuid.UUID `json:"id"`
	Kind      string    `json:"kind"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Remaining float64   `json:"remaining"`
	// Caught is how many monsters a rune has held so far, absent while none,
	// so a client can flash it as the count climbs (R24, R47).
	Caught int `json:"caught,omitempty"`
}

// BookPageState is one offered page as its owner is told it: Cost its whole
// cost in the class resource (0 for the mercenary's), Cooldown its book
// cooldown ({0, 0} when ready, FS-Q18Q3 R1), Spent while a once-per-floor or
// once-per-delve use is spent. FS-X2CMM §F R32.
type BookPageState struct {
	ID          string        `json:"id"`
	UnlockLevel int           `json:"unlock_level"`
	Cost        int           `json:"cost"`
	Cooldown    CooldownState `json:"cooldown"`
	Spent       bool          `json:"spent"`
}

// BookTimedState is a named state a book ability set on a delver (hardened,
// afloat, trackers_eye, long_night, draught), with its seconds left; on the
// delver's own state and everyone else's. FS-X2CMM §F R34.
type BookTimedState struct {
	Name      string  `json:"name"`
	Remaining float64 `json:"remaining"`
}
