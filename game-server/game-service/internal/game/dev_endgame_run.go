package game

import (
	"log/slog"

	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
)

/*
	The endgame test run (FS-BDRTJ §Change: Endgame test run): a dev-only Spire
	run of one, behind the dev test room's guard, that climbs floors 6 to 10 of
	a height-10 Spire on one fixed plan. Only what the run spawns is fixed: its
	height, its first floor, each floor's pool and monster level, no Blood
	Demon, and the tome and the altar's floors (Vorsk summoned at the altar
	floor's level + 2). Layouts, counts, placement, the elite roll, Daa'gon and every drop
	roll are a Spire run's as shipped, and it settles as any run does (R24, R32,
	R33). A session without a plan behaves exactly as before (R35).
*/

// endgamePlan is the run's fixed plan. Changing it is `Tunes FS-BDRTJ` (R25).
type endgamePlan struct {
	// Height is the run's height, in place of rollSpireHeight
	Height int
	// FirstFloor is the floor the run begins on, in place of firstFloor
	FirstFloor int
	// LevelOverFloor is what every standard monster on floor N stands at over
	// N: N + LevelOverFloor, with no spread (R27)
	LevelOverFloor int
	// Pools is each floor's pool of five, by variant, in place of the draw (R26)
	Pools map[int][]components.MonsterArchetype
	// TomeFloor and AltarFloor make every such run a tome run, in place of
	// FS-3103M's TomeRunChance and its floor draws (R29)
	TomeFloor, AltarFloor int
}

// endgameRunPlan is the one plan. Every 26+ variant is on at least one floor,
// and a Dark Warrior on every floor (R26, R28).
var endgameRunPlan = endgamePlan{
	Height:         MasterSpireHeight,
	FirstFloor:     6,
	LevelOverFloor: 20,
	TomeFloor:      6,
	AltarFloor:     8,
	Pools: map[int][]components.MonsterArchetype{
		6: {
			components.MonsterArchetypeDarkWarrior, components.MonsterArchetypeBloodTroll,
			components.MonsterArchetypeRavener, components.MonsterArchetypeBlightborn,
			components.MonsterArchetypeWightArcher,
		},
		7: {
			components.MonsterArchetypeDarkWarrior, components.MonsterArchetypeOgreTyrant,
			components.MonsterArchetypeBanshee, components.MonsterArchetypeGoblinWarchief,
			components.MonsterArchetypeWightArcher,
		},
		8: {
			components.MonsterArchetypeDarkWarrior, components.MonsterArchetypeDarkReaper,
			components.MonsterArchetypeRavener, components.MonsterArchetypeBanshee,
			components.MonsterArchetypeWightArcher,
		},
		9: {
			components.MonsterArchetypeDarkWarrior, components.MonsterArchetypeBloodTroll,
			components.MonsterArchetypeBlightborn, components.MonsterArchetypeGoblinWarchief,
			components.MonsterArchetypeWightArcher,
		},
		// no ranged member: its archer slots stay fodder (FS-C8VM7 §C R22)
		10: {
			components.MonsterArchetypeDarkWarrior, components.MonsterArchetypeDarkReaper,
			components.MonsterArchetypeOgreTyrant, components.MonsterArchetypeRavener,
			components.MonsterArchetypeBanshee,
		},
	},
}

// monsterLevel is every standard monster's level on floor: elites and
// treasure guards included (R27).
func (p *endgamePlan) monsterLevel(floor int) int {
	return floor + p.LevelOverFloor
}

// partyLevel is the party level the floor's level rule reads to give the
// plan's level with no spread, so a boss built on that rule stands at the
// plan's level plus its own bonus: Daa'gon 35 on floor 10 (R27, R30).
func (p *endgamePlan) partyLevel(floor int) int {
	return p.monsterLevel(floor) - MonsterLevelPerFloor*(floor-1)
}

// pool is floor's pool, at the tier of its level. A variant the roster does
// not have is left out; the plan's test fails on it first.
func (p *endgamePlan) pool(floor int) floorPool {
	pool := floorPool{LevelTier: tierOf(p.monsterLevel(floor))}
	for _, archetype := range p.Pools[floor] {
		if entry, ok := variantOf(archetype); ok {
			pool.Members = append(pool.Members, entry)
		}
	}
	return pool
}

/**
* settle is the plan's last word on a floor's standard monsters, once the Dark
* Warrior cap has run: each stands at the floor's level, and if no Dark
* Warrior-family monster stands, one is recast as one where the cap allows it
* (R27, R28). Nothing on a run without a plan.
**/
func (p *endgamePlan) settle(rng populationRand, pool floorPool, floor int, monsters []*MonsterConfig) {
	if p == nil {
		return
	}
	for _, m := range monsters {
		m.Level = p.monsterLevel(floor)
	}
	ensureDarkWarrior(rng, pool, floor, monsters)
}

/**
* ensureDarkWarrior recasts one monster as a capped-family variant of the pool
* when none of monsters is one: a brute first, else a fodder, else any. It
* never passes the cap: a floor whose cap is 0 is left as it is, with a
* warning (R28).
**/
func ensureDarkWarrior(rng populationRand, pool floorPool, floor int, monsters []*MonsterConfig) {
	var darkWarriors []rosterEntry
	for _, m := range pool.Members {
		if m.Family.Capped {
			darkWarriors = append(darkWarriors, m)
		}
	}
	if len(darkWarriors) == 0 {
		return
	}

	byRole := map[monsterRole][]*MonsterConfig{}
	for _, m := range monsters {
		if capped(m.Archetype) {
			return
		}
		if entry, ok := variantOf(m.Archetype); ok {
			byRole[entry.Family.Role] = append(byRole[entry.Family.Role], m)
		}
	}
	if min(DarkWarriorCapMax, len(monsters)/DarkWarriorPer) == 0 {
		slog.Warn("Endgame test run floor holds no Dark Warrior: too few monsters for the cap",
			"floor", floor, "monsters", len(monsters))
		return
	}

	for _, role := range []monsterRole{roleBrute, roleFodder, roleRanged} {
		if candidates := byRole[role]; len(candidates) > 0 {
			variant, _ := pick(rng, darkWarriors)
			candidates[rng.IntN(len(candidates))].recast(variant.rollLook(rng))
			return
		}
	}
}

// withEndgameRunPlan builds the run on plan.
func withEndgameRunPlan(plan *endgamePlan) sessionOption {
	return func(s *Session) { s.endgame = plan }
}

// NewEndgameRun is NewSession for the endgame test run: a run world on the one
// plan. Its signature is NewSession's, so the server builds either the same
// way (R25).
func NewEndgameRun(sessionCloser SessionCloser, sender *messaging.MessageSender, serializer StateSerializer, em *ecs.EntityManager, eventEmitter EventEmitter, itemsClient grpcitems.ItemsClient, bounds WorldBounds) *Session {
	s := newSession(sessionCloser, sender, serializer, em, eventEmitter, itemsClient, bounds, withEndgameRunPlan(&endgameRunPlan))

	go s.Start()

	return s
}

// startFloor is the floor this run begins on: its plan's, else the first.
func (s *Session) startFloor() int {
	if s.endgame != nil {
		return s.endgame.FirstFloor
	}
	return firstFloor
}

// endgameRunHubGate is deliberately not in hubGates, as the room's gate is not
// (R19): 184 px from both the room's gate and the Forest's.
var endgameRunHubGate = hubGate{
	Destination: components.GateDestinationDevEndgameRun,
	X:           160,
	Y:           720,
	Arrival:     &components.GateArrival{X: 300, Y: 720},
}

// AddEndgameRunGate stands the run's gate in the hub. Called once at boot, only
// when the dev test room is on, before anyone can connect (R18, R19).
func (s *Session) AddEndgameRunGate() {
	s.indexGate(CreateGateEntity(s.EntityManager, endgameRunHubGate))
}
