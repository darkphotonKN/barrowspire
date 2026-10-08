// Package progression is the single experience table (FS-BDA7X R14–R15),
// shared by character-service (persisted level) and game-service (in-run
// level-ups). Tune pacing by editing totalToReach only; neither service keeps
// its own copy.
package progression

// MaxLevel is the level cap. Experience keeps accumulating past it; the level
// does not.
const MaxLevel int32 = 20

// totalToReach[i] is the total experience at which level i+1 begins.
var totalToReach = [MaxLevel]int64{
	0, 100, 230, 390, 600, 870, 1210, 1650, 2210, 2930,
	3850, 5030, 6540, 8470, 10950, 14120, 18180, 23370, 30020, 38530,
}

// LevelFor returns the level (1..MaxLevel) a character with total experience
// exp has reached.
func LevelFor(exp int64) int32 {
	level := int32(1)
	for i := int32(1); i < MaxLevel; i++ {
		if exp < totalToReach[i] {
			break
		}
		level = i + 1
	}
	return level
}

// LevelFloor returns the total experience at which level began. Levels outside
// 1..MaxLevel clamp to the nearest bound.
func LevelFloor(level int32) int64 {
	return totalToReach[clamp(level)-1]
}

// NextLevelAt returns the total experience needed for the level after level,
// and false at (or above) the cap, where there is no next level.
func NextLevelAt(level int32) (int64, bool) {
	l := clamp(level)
	if l >= MaxLevel {
		return 0, false
	}
	return totalToReach[l], true
}

func clamp(level int32) int32 {
	if level < 1 {
		return 1
	}
	if level > MaxLevel {
		return MaxLevel
	}
	return level
}
