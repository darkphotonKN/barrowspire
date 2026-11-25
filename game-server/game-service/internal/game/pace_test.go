package game

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	commonconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
The pace pin (FS-TAGWA R7, ADR-0099): every travel speed this package defines
is its full-pace figure times PaceScale. The figures below are the speeds as
they stood before the pace, in px/s. A sheet, ally kind or shot added without a
row here fails, so nothing new escapes the knob.
*/

// fullPaceMoveSpeed is each literal monster sheet's move speed at full pace;
// a roster archetype's is its family's step 0's plus the gain a step (a
// shield look its blade look's).
var fullPaceMoveSpeed = map[components.MonsterArchetype]float64{
	components.MonsterArchetypeGhoul:        150,
	components.MonsterArchetypeBoneArcher:   130,
	components.MonsterArchetypeTroll:        90,
	components.MonsterArchetypeDemon:        120,
	components.MonsterArchetypeBloodDemon:   120,
	components.MonsterArchetypeDaagon:       120,
	components.MonsterArchetypeBoar:         140,
	components.MonsterArchetypeZombie:       100,
	components.MonsterArchetypeGhost:        175,
	components.MonsterArchetypeBarrowThrall: 100,
	components.MonsterArchetypeSpireWraith:  175,
	components.MonsterArchetypeGoblin:       160,
	components.MonsterArchetypeOgre:         75,
	components.MonsterArchetypeDarkWarrior:  120,
	components.MonsterArchetypeCutthroat:    165,
	components.MonsterArchetypeContractMark: 150,
}

// fullPaceShotSpeed is each monster projectile's flight speed at full pace, by
// the type the client draws.
var fullPaceShotSpeed = map[string]float64{
	"bone_arrow":    420,
	"thrown_dagger": 480,
	"ogre_rock":     240,
}

const (
	fullPaceDelverWalk   = 200.0
	fullPaceResidentWalk = 60.0
	fullPaceStepGain     = 8.0
	fullPaceAllyWalk     = 190.0
)

// The knob's value is the owner's to turn: no test pins it, so a tweak is one
// constant and the golden's -update (ADR-0099); every pin below holds at any value.

func TestPace_WalksAndTheStepGainArePaced(t *testing.T) {
	assert.Equal(t, fullPaceDelverWalk*commonconstants.PaceScale, commonconstants.DefaultSpeed, "a delver's walk")
	assert.Equal(t, fullPaceResidentWalk*commonconstants.PaceScale, commonconstants.NPCWanderSpeed, "a hub resident's amble")
	assert.Equal(t, fullPaceStepGain*commonconstants.PaceScale, VariantStepSpeedGain, "a roster step's speed gain")
}

func TestPace_EveryMonsterSheetIsPaced(t *testing.T) {
	for archetype, sheet := range monsterSheets {
		full, ok := fullPaceMoveSpeed[archetype]
		if entry, onRoster := variantOf(archetype); onRoster {
			step0, known := fullPaceMoveSpeed[entry.Family.Variants[0].Archetype]
			require.True(t, known, "%s: its family's step 0 has no full-pace row", archetype)
			full, ok = step0+fullPaceStepGain*float64(entry.Step), true
		}
		require.True(t, ok, "%s has no full-pace row: add it, paced", archetype)
		assert.InDelta(t, full*commonconstants.PaceScale, sheet.MoveSpeed, 1e-9, "%s's move speed", archetype)
	}
}

func TestPace_EveryMonsterShotIsPaced(t *testing.T) {
	check := func(owner components.MonsterArchetype, projectile string, speed float64) {
		full, ok := fullPaceShotSpeed[projectile]
		require.True(t, ok, "%s's %q has no full-pace row: add it, paced", owner, projectile)
		assert.Equal(t, full*commonconstants.PaceScale, speed, "%s's %q", owner, projectile)
	}
	for archetype, sheet := range monsterSheets {
		if sheet.Shot.Speed > 0 {
			check(archetype, sheet.Shot.ProjectileType, sheet.Shot.Speed)
		}
		if sheet.Ability.ShotSpeed > 0 {
			check(archetype, sheet.Ability.ProjectileType, sheet.Ability.ShotSpeed)
		}
	}
}

func TestPace_EveryAllySheetIsPaced(t *testing.T) {
	require.NotEmpty(t, AllySheets)
	for kind, sheet := range AllySheets {
		assert.Equal(t, fullPaceAllyWalk*commonconstants.PaceScale, sheet.MoveSpeed, "%s's pace", kind)
	}
}

// A travel budget, a timer that exists as a walk's allowance, stretches as the
// walk slows, so the ground it allows is the same at any pace (FS-TAGWA R15):
// the brazier windows (a floor stays solvable by one, ADR-0092) and the
// mark's longest flight.
func TestPace_TravelBudgetsStretchWithThePace(t *testing.T) {
	assert.Equal(t, 60/commonconstants.PaceScale, BrazierWindow, "the party's brazier window")
	assert.Equal(t, 90/commonconstants.PaceScale, BrazierWindowSolo, "the solo brazier window")
	assert.Equal(t, 60/commonconstants.PaceScale, MarkFleeMaxSeconds, "the mark's longest flight")
}

// ticksToWalk is how many ticks a delver at the paced walk takes to cover px:
// for tests that walk a body a set distance whatever the pace.
func ticksToWalk(px float64) int {
	return int(math.Ceil(px / (commonconstants.DefaultSpeed / float64(commonconstants.GameFrameRate))))
}

/*
The town bonus (FS-TAGWA R16): a delver walks HubMoveSpeedBonusPercent faster
in the hub, on top of the paced walk and worn move speed alike, and nowhere
else; the hub's residents keep their amble.
*/
func TestPace_TheTownBonusIsTheHubsAlone(t *testing.T) {
	worlds := []struct {
		name   string
		bounds WorldBounds
		want   float64
	}{
		{"the hub", HubBounds(), commonconstants.DefaultSpeed * (1 + commonconstants.HubMoveSpeedBonusPercent/100.0)},
		{"a run", RunBounds(), commonconstants.DefaultSpeed},
		{"a field", FieldBounds(GentleMeadows()), commonconstants.DefaultSpeed},
	}
	for _, w := range worlds {
		t.Run(w.name, func(t *testing.T) {
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, w.bounds)
			_, delver := placeDelver(t, s, "warrior", 500, 500)
			resident := CreateResidentEntity(s.EntityManager, hubResidents[0])

			s.step(1.0/float64(commonconstants.GameFrameRate), s.EntityManager.GetAllEntities())

			assert.InDelta(t, w.want, velocityOf(delver).Speed, 1e-9, "a delver's walk")
			assert.Equal(t, commonconstants.NPCWanderSpeed, velocityOf(resident).Speed, "a resident's amble")
		})
	}
}

func TestPace_TheTownBonusIsItsOwnTen(t *testing.T) {
	assert.Equal(t, 10, commonconstants.HubMoveSpeedBonusPercent)
}
