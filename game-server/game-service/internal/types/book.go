package types

// BookState is a delver's class book as its owner is told it, in a run only:
// the offered pages of their class's book, in book order, locked ones
// included. FS-X2CMM §F R32.
type BookState struct {
	Pages []BookPageState `json:"pages"`
	// casting ({page, remaining, total}) joins here with cast time (§D).
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
// and later afloat, trackers_eye, long_night), with its seconds left; on the
// delver's own state and everyone else's. FS-X2CMM §F R34.
type BookTimedState struct {
	Name      string  `json:"name"`
	Remaining float64 `json:"remaining"`
}
