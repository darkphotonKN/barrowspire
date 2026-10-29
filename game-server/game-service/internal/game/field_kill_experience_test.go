package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 6, 30; Edge States "Killer dies", "Kill by a projectile
// after the shooter left", "Character at the level cap". I-X2F2H-3.

var fieldKael = types.CharacterInPlay{ID: uuid.New(), Name: "Kael", Class: "mage", Level: 2, Experience: 300}

// visitor seats a member in the field and hands back their id.
func visitor(t *testing.T, field *Session, character types.CharacterInPlay) uuid.UUID {
	t.Helper()
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, character, fieldLoadout())
	require.NoError(t, err)
	return memberID
}

// experienceOf is a member's body's experience in its world.
func experienceOf(t *testing.T, s *Session, memberID uuid.UUID) int {
	t.Helper()
	sc, ok := delverEntity(t, s, memberID).GetComponent(ecs.ComponentTypeStats)
	require.True(t, ok)
	return sc.(*components.StatsComponent).Experience
}

func boarKilledBy(killer uuid.UUID, level int, elite bool) systems.KillRecord {
	return systems.KillRecord{
		MonsterEntityID: uuid.New(), Archetype: components.MonsterArchetypeBoar,
		Level: level, Elite: elite, KillerMemberID: killer, Floor: 1,
	}
}

// The killing blow alone earns a field kill, at the Spire's kill-XP formula; a
// player standing beside them earns nothing. The visit tallies it. R30, D12.
func TestFieldKillCredit_OnlyTheKillerGains(t *testing.T) {
	tests := []struct {
		name   string
		record func(killer uuid.UUID) systems.KillRecord
	}{
		{"a boar", func(k uuid.UUID) systems.KillRecord { return boarKilledBy(k, 3, false) }},
		{"an elite boar", func(k uuid.UUID) systems.KillRecord { return boarKilledBy(k, 4, true) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field := builtField(t)
			killer := visitor(t, field, fieldWren)
			beside := visitor(t, field, fieldKael)
			record := tt.record(killer)
			want := killExperience(record)
			require.Positive(t, want)

			field.publishKills([]systems.KillRecord{record, record})

			assert.Equal(t, int(fieldWren.Experience)+2*want, experienceOf(t, field, killer))
			assert.Equal(t, int(fieldKael.Experience), experienceOf(t, field, beside), "beside the killer, nothing")

			killerVisit, _ := field.EndVisit(killer)
			besideVisit, _ := field.EndVisit(beside)
			assert.Equal(t, 2*want, killerVisit.ExperienceGained, "the visit tallies what the killer earned")
			assert.Zero(t, besideVisit.ExperienceGained)
			assert.Equal(t, fieldWren.Experience+int64(2*want), killerVisit.Experience)
		})
	}
}

// A fallen killer still earns their kill; a killer who left the field earns
// nothing, and neither does anyone else; a kill with no player killer earns
// nothing. R30, Edge States "Killer dies", "Kill by a projectile after the
// shooter left".
func TestFieldKillCredit_KillersWhereabouts(t *testing.T) {
	t.Run("fallen", func(t *testing.T) {
		field := builtField(t)
		killer := visitor(t, field, fieldWren)
		setHealth(t, delverEntity(t, field, killer), 0)
		record := boarKilledBy(killer, 1, false)

		field.publishKills([]systems.KillRecord{record})

		assert.Equal(t, int(fieldWren.Experience)+killExperience(record), experienceOf(t, field, killer))
	})

	t.Run("left the field", func(t *testing.T) {
		field := builtField(t)
		killer := visitor(t, field, fieldWren)
		beside := visitor(t, field, fieldKael)
		_, ended := field.EndVisit(killer)
		require.True(t, ended)

		field.publishKills([]systems.KillRecord{boarKilledBy(killer, 1, false)})

		assert.Equal(t, int(fieldKael.Experience), experienceOf(t, field, beside))
		besideVisit, _ := field.EndVisit(beside)
		assert.Zero(t, besideVisit.ExperienceGained)
	})

	t.Run("no player killer", func(t *testing.T) {
		field := builtField(t)
		member := visitor(t, field, fieldWren)

		field.publishKills([]systems.KillRecord{boarKilledBy(uuid.Nil, 1, false)})

		assert.Equal(t, int(fieldWren.Experience), experienceOf(t, field, member))
	})
}

// A visit's tally starts at zero: what an earlier visit earned is not counted
// again. R13.
func TestFieldKillCredit_EveryVisitStartsAtZero(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)
	field.publishKills([]systems.KillRecord{boarKilledBy(memberID, 1, false)})
	first, _ := field.EndVisit(memberID)
	require.Positive(t, first.ExperienceGained)

	_, err = field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)
	second, _ := field.EndVisit(memberID)

	assert.Zero(t, second.ExperienceGained)
}

// Kills credited on the tick race a leave from another goroutine: every kill
// either lands in the visit that ends or finds nobody, and what the visit
// carries home agrees with the body it was taken from. R30, R49.
func TestFieldKillCredit_RacesALeave(t *testing.T) {
	field := builtField(t)
	memberID := visitor(t, field, fieldWren)
	record := boarKilledBy(memberID, 1, false)
	per := killExperience(record)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for range 200 {
			field.publishKills([]systems.KillRecord{record})
		}
	}()
	visit, ended := field.EndVisit(memberID)
	<-done

	require.True(t, ended)
	assert.Zero(t, visit.ExperienceGained%per)
	assert.Equal(t, fieldWren.Experience+int64(visit.ExperienceGained), visit.Experience,
		"the tally and the body's experience were taken together")
}

// A field kill levels its killer on the spot, as a run's does; at the cap the
// experience still accumulates and is tallied. Edge State "Character at the
// level cap".
func TestFieldKillCredit_LevelsTheKillerUpToTheCap(t *testing.T) {
	field := builtField(t)
	nearly := types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 1, Experience: 95}
	capped := types.CharacterInPlay{ID: uuid.New(), Name: "Kael", Class: "mage", Level: 20, Experience: 40000}
	riser := visitor(t, field, nearly)
	veteran := visitor(t, field, capped)

	field.publishKills([]systems.KillRecord{boarKilledBy(riser, 1, false), boarKilledBy(veteran, 1, false)})

	sc, _ := delverEntity(t, field, riser).GetComponent(ecs.ComponentTypeStats)
	assert.Equal(t, 2, sc.(*components.StatsComponent).Level, "levelled in the same tick")
	sc, _ = delverEntity(t, field, veteran).GetComponent(ecs.ComponentTypeStats)
	assert.Equal(t, 20, sc.(*components.StatsComponent).Level, "the cap holds")
	visit, _ := field.EndVisit(veteran)
	assert.Equal(t, killExperience(boarKilledBy(veteran, 1, false)), visit.ExperienceGained)
}

// In a field, monsters tick: a boar beside a player strikes them, and a player
// strikes a boar down on the tick, earning its XP; its corpse lies, then clears.
// R6, AC "field monsters attack and are killed".
func TestFieldWorld_MonstersFightAndFall(t *testing.T) {
	field := builtField(t)
	require.True(t, field.hasMonsters())
	memberID := visitor(t, field, fieldWren)
	boar := spawnedAt(t, field, 0)
	home := monsterOf(boar)
	moveBody(t, field, memberID, home.HomeX+30, home.HomeY)
	tick(field) // the gear counts from the first tick
	full := healthOf(t, field, memberID)

	tickFor(field, 3)
	assert.Less(t, healthOf(t, field, memberID), full, "the boar strikes the player beside it")

	setHealth(t, boar, 1)
	before := experienceOf(t, field, memberID)
	require.NoError(t, field.handleAttack(memberID, boar.ID))
	tick(field)

	assert.Equal(t, components.MonsterActionDead, monsterOf(boar).Action, "it lies dead")
	assert.Equal(t, before+killExperience(boarKilledBy(memberID, home.Level, home.Elite)), experienceOf(t, field, memberID))

	tickFor(field, MonsterCorpseLifetime+0.1)
	_, lies := field.EntityManager.GetEntity(boar.ID)
	assert.False(t, lies, "the corpse clears")
}
