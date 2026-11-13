package game

import (
	"slices"
	"strings"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/*
	The floor pool: the five variants a Spire floor's standard monsters come
	from, drawn when the floor is built from everything its level tier
	unlocks.
	FS-C8VM7 §C R19-R25.
*/

// floorPool is a floor's variants, each with its place on the roster, in the
// order they were drawn.
type floorPool struct {
	LevelTier int
	Members   []rosterEntry
}

// floorBaseLevel is the level a floor's level tier is read from: the party's plus
// the floor's offset, with no spread (FS-C8VM7 §A R1).
func floorBaseLevel(partyLevel, floor int) int {
	return monsterLevel(partyLevel, floor, 0)
}

// unlockedAt is every roster variant a floor of this level tier may draw, in
// roster order (FS-C8VM7 §A R2).
func unlockedAt(levelTier int) []rosterEntry {
	var unlocked []rosterEntry
	for i := range spireRoster {
		family := &spireRoster[i]
		for step, v := range family.Variants {
			if v.Unlock <= levelTier {
				unlocked = append(unlocked, rosterEntry{Family: family, Step: step, Variant: v})
			}
		}
	}
	return unlocked
}

/**
* drawFloorPool is a floor's pool at its level tier: FloorPoolSize distinct unlocked
* variants, all of them when there are no more. One brute, then two fodder,
* take the guaranteed places first, then the rest are drawn from everything
* left; every draw is weighted by its family's pool weight, without
* replacement (FS-C8VM7 §C R19-R20).
**/
func drawFloorPool(rng populationRand, levelTier int) floorPool {
	left := unlockedAt(levelTier)
	if len(left) <= FloorPoolSize {
		return floorPool{LevelTier: levelTier, Members: left}
	}

	pool := floorPool{LevelTier: levelTier}
	take := func(fits func(rosterEntry) bool) {
		if i, ok := weightedPick(rng, left, fits); ok {
			pool.Members = append(pool.Members, left[i])
			left = slices.Delete(left, i, i+1)
		}
	}
	isRole := func(role monsterRole) func(rosterEntry) bool {
		return func(e rosterEntry) bool { return e.Family.Role == role }
	}

	take(isRole(roleBrute))
	take(isRole(roleFodder))
	take(isRole(roleFodder))
	for len(pool.Members) < FloorPoolSize {
		take(func(rosterEntry) bool { return true })
	}
	return pool
}

// weightedPick is the index of one entry fits accepts, drawn by its family's
// pool weight; false when fits accepts none.
func weightedPick(rng populationRand, entries []rosterEntry, fits func(rosterEntry) bool) (int, bool) {
	total := 0
	for _, e := range entries {
		if fits(e) {
			total += e.Family.poolWeight()
		}
	}
	if total == 0 {
		return 0, false
	}
	draw := rng.IntN(total)
	for i, e := range entries {
		if !fits(e) {
			continue
		}
		if draw -= e.Family.poolWeight(); draw < 0 {
			return i, true
		}
	}
	return 0, false
}

// poolWeight is how heavily a family's variants weigh in a pool draw: 1
// unless the roster says otherwise.
func (f *monsterFamily) poolWeight() int {
	return max(f.PoolWeight, 1)
}

// of is the pool's members of a role, in pool order.
func (p floorPool) of(role monsterRole) []rosterEntry {
	var members []rosterEntry
	for _, m := range p.Members {
		if m.Family.Role == role {
			members = append(members, m)
		}
	}
	return members
}

// pick is a uniform draw among members; false with none.
func pick(rng populationRand, members []rosterEntry) (monsterVariant, bool) {
	if len(members) == 0 {
		return monsterVariant{}, false
	}
	return members[rng.IntN(len(members))].Variant, true
}

// brute is a uniform draw among the pool's brutes.
func (p floorPool) brute(rng populationRand) (monsterVariant, bool) {
	return pick(rng, p.of(roleBrute))
}

// fodder is a uniform draw among the pool's fodder.
func (p floorPool) fodder(rng populationRand) (monsterVariant, bool) {
	return pick(rng, p.of(roleFodder))
}

// ranged is a uniform draw among the pool's ranged members; false with none,
// with no draw made (FS-C8VM7 §C R22).
func (p floorPool) ranged(rng populationRand) (monsterVariant, bool) {
	return pick(rng, p.of(roleRanged))
}

/**
* rolled is a rolled monster's variant (FS-C8VM7 §C R21): a brute at the
* floor's brute share, drawn uniformly among the pool's brutes, otherwise a
* fodder drawn uniformly among its fodder. A ranged member is never rolled
* here: it only fills an archer slot.
**/
func (p floorPool) rolled(rng populationRand, floor int) monsterVariant {
	if rng.Float64() < bruteShare(floor) {
		if brute, ok := p.brute(rng); ok {
			return brute
		}
	}
	if fodder, ok := p.fodder(rng); ok {
		return fodder
	}
	brute, _ := p.brute(rng)
	return brute
}

// isFodder is whether v is one of the pool's fodder.
func (p floorPool) isFodder(v monsterVariant) bool {
	return slices.ContainsFunc(p.of(roleFodder), func(m rosterEntry) bool { return m.Variant.Archetype == v.Archetype })
}

// archetypes is every archetype the pool can spawn, a goblin variant both its
// looks, in pool order: the floor map's enemy_pool (FS-C8VM7 §G R40).
func (p floorPool) archetypes() []components.MonsterArchetype {
	all := []components.MonsterArchetype{}
	for _, m := range p.Members {
		all = append(all, m.Variant.Archetype)
		if m.Variant.ShieldLook != "" {
			all = append(all, m.Variant.ShieldLook)
		}
	}
	return all
}

// capped is whether an archetype is of a family the pool caps per floor.
func capped(archetype components.MonsterArchetype) bool {
	entry, ok := variantOf(archetype)
	return ok && entry.Family.Capped
}

/**
* capDarkWarriors redraws the excess of a floor's capped-family monsters over
* min(DarkWarriorCapMax, ⌊n / DarkWarriorPer⌋), n being every monster given,
* the excess chosen at random. Each is redrawn as another brute of the pool, a
* fodder when the pool has no brute outside the capped family, keeping where it
* stands, its level and whether it is elite (FS-C8VM7 §C R24).
**/
func (p floorPool) capDarkWarriors(rng populationRand, monsters []*MonsterConfig) {
	var over []*MonsterConfig
	for _, m := range monsters {
		if capped(m.Archetype) {
			over = append(over, m)
		}
	}
	allowed := min(DarkWarriorCapMax, len(monsters)/DarkWarriorPer)
	if len(over) <= allowed {
		return
	}
	shuffle(rng, over)

	var others []rosterEntry
	for _, b := range p.of(roleBrute) {
		if !b.Family.Capped {
			others = append(others, b)
		}
	}
	for _, m := range over[allowed:] {
		variant, ok := pick(rng, others)
		if !ok {
			variant, _ = p.fodder(rng)
		}
		m.recast(variant.rollLook(rng))
	}
}

// recast makes a rolled monster another archetype in place, its elite prefix
// kept on its new name.
func (m *MonsterConfig) recast(archetype components.MonsterArchetype) {
	if m.Elite {
		prefix := strings.TrimSuffix(m.Name, monsterSheets[m.Archetype].Name)
		m.Name = prefix + monsterSheets[archetype].Name
	}
	m.Archetype = archetype
}
