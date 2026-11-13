package components

// MonsterAbilityKind names a monster ability as the wire does (FS-C8VM7 §B
// R11, R17).
type MonsterAbilityKind string

const (
	MonsterAbilityPounce     MonsterAbilityKind = "pounce"
	MonsterAbilityGroundSlam MonsterAbilityKind = "ground_slam"
	MonsterAbilityBurst      MonsterAbilityKind = "burst"
	MonsterAbilityWail       MonsterAbilityKind = "wail"
	MonsterAbilityCleave     MonsterAbilityKind = "cleave"
	MonsterAbilityVolley     MonsterAbilityKind = "volley"
	MonsterAbilityDagger     MonsterAbilityKind = "dagger"
	MonsterAbilityRock       MonsterAbilityKind = "rock"
)

// MonsterAbilityShape is how a monster ability lands (FS-C8VM7 §B R11).
type MonsterAbilityShape string

const (
	// AbilityAreaAroundSelf is a circle centred where the monster stood when
	// its wind-up started
	AbilityAreaAroundSelf MonsterAbilityShape = "area"
	// AbilityCone is a cone in front, along its facing when the wind-up started
	AbilityCone MonsterAbilityShape = "cone"
	// AbilityShots is one or more monster shots, aimed where the target stands
	// when the wind-up ends
	AbilityShots MonsterAbilityShape = "shots"
	// AbilityLeap is a leap to the point the target stood on when the wind-up
	// started, then an area centred where it lands
	AbilityLeap MonsterAbilityShape = "leap"
	// AbilityDeathBurst is an area on its corpse, a fuse after its death;
	// never chosen in a fight
	AbilityDeathBurst MonsterAbilityShape = "death_burst"
)

// MonsterAbility is a monster's one special move as its sheet gives it: what
// it is, how it lands, when it is used and its numbers; the zero value, with
// no Kind, for a monster with none. Pure data; the
// MonsterAISystem uses it and the CombatSystem lands it. FS-C8VM7 §B R10-R14.
type MonsterAbility struct {
	Kind  MonsterAbilityKind
	Shape MonsterAbilityShape
	// MinRange, MaxRange are the target distances, in px, at which it is used
	MinRange, MaxRange float64
	// WindUp is the seconds from choosing it to its landing, a leap's not
	// counted; a death burst's fuse
	WindUp   float64
	Cooldown float64 // s, from the start of its wind-up
	// Multiplier is its damage over the monster's level damage, per hit
	Multiplier float64

	// Radius is an area's radius or a cone's reach, in px
	Radius float64
	// Arc is a cone's full angle in degrees; 0 for a circle
	Arc float64
	// LeapTime is a leap's flight, in seconds, after its wind-up
	LeapTime float64

	// The shots, for AbilityShots: Shots projectiles of ProjectileType, Fan
	// degrees apart and centred on the aim.
	ProjectileType string
	ShotSpeed      float64 // px/s
	ShotRadius     float64 // px
	ShotMaxFlight  float64 // px
	Shots          int
	Fan            float64 // degrees
}

// PendingAbility is a monster ability being wound up, a leap in flight or a
// death burst's fuse burning, fixed where it will land (FS-C8VM7 §B R13,
// R15-R16). Remaining is 0 while none is pending.
type PendingAbility struct {
	// Remaining is the seconds until it lands, a leap's flight included
	Remaining float64
	// X, Y is an area's centre (a leap's landing point, a burst's corpse) or
	// a cone's apex, in world px
	X, Y float64
	// FacingX, FacingY is a cone's direction, a unit vector
	FacingX, FacingY float64

	// Leaping is set once a leap has left the ground, from FromX, FromY
	Leaping      bool
	FromX, FromY float64

	// Attack is a death burst's hit, snapshotted at its death: it lands with
	// the Blightborn's damage then, and is the Blightborn's
	Attack AttackSnapshot
}
