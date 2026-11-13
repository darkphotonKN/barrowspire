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
	WindUp             float64 // s, from choosing it to its landing
	Cooldown           float64 // s, from the start of its wind-up
	// Multiplier is its damage over the monster's level damage, per hit
	Multiplier float64

	// Radius is an area's radius or a cone's reach, in px
	Radius float64
	// Arc is a cone's full angle in degrees; 0 for a circle
	Arc float64

	// The shots, for AbilityShots: Shots projectiles of ProjectileType, Fan
	// degrees apart and centred on the aim.
	ProjectileType string
	ShotSpeed      float64 // px/s
	ShotRadius     float64 // px
	ShotMaxFlight  float64 // px
	Shots          int
	Fan            float64 // degrees
}

// PendingAbility is a monster ability being wound up, fixed where it will
// land (FS-C8VM7 §B R13). Remaining is 0 while none is pending.
type PendingAbility struct {
	// Remaining is the seconds until it lands
	Remaining float64
	// X, Y is an area's centre or a cone's apex, in world px
	X, Y float64
	// FacingX, FacingY is a cone's direction, a unit vector
	FacingX, FacingY float64
}
