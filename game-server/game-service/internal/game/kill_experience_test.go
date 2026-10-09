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

// Kill experience = round(base × (1 + 0.15 × (level − 1)) × multiplier), with
// base ghoul 10 / troll 25 / demon 25 and multiplier elite 3, demon 10.
// FS-BDA7X §Requirements 10–11.
func TestKillExperience_Formula(t *testing.T) {
	tests := []struct {
		name   string
		record systems.KillRecord
		want   int
	}{
		{"level-1 ghoul", systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 1}, 10},
		{"level-1 troll", systems.KillRecord{Archetype: components.MonsterArchetypeTroll, Level: 1}, 25},
		{"level-3 ghoul", systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 3}, 13},
		{"level-3 elite troll", systems.KillRecord{Archetype: components.MonsterArchetypeTroll, Level: 3, Elite: true}, 98},
		{"level-1 elite ghoul", systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 1, Elite: true}, 30},
		{"level-1 demon", systems.KillRecord{Archetype: components.MonsterArchetypeDemon, Level: 1, Boss: true}, 250},
		{"level-5 demon", systems.KillRecord{Archetype: components.MonsterArchetypeDemon, Level: 5, Boss: true}, 400},
		{"level 0 counts as level 1", systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 0}, 10},
		{"unknown archetype is worth nothing", systems.KillRecord{Archetype: "wisp", Level: 4}, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.record.KillerMemberID = uuid.New()
			assert.Equal(t, tt.want, killExperience(tt.record))
		})
	}
}

// member is a seated delver in a run, for awarding to.
type member struct {
	id   uuid.UUID
	body seatedBody
}

func seatMember(t *testing.T, s *Session, character types.CharacterInPlay) member {
	t.Helper()

	id := uuid.New()
	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(id, character))
	require.True(t, ok)

	sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	mc, _ := entity.GetComponent(ecs.ComponentTypeMana)
	pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)

	return member{id: id, body: seatedBody{
		stats:  sc.(*components.StatsComponent),
		health: hc.(*components.HealthComponent),
		mana:   mc.(*components.ManaComponent),
		player: pc.(*components.PlayerComponent),
	}}
}

func ghoulKilledBy(killer uuid.UUID) systems.KillRecord {
	return systems.KillRecord{MonsterEntityID: uuid.New(), Archetype: components.MonsterArchetypeGhoul, Level: 1, KillerMemberID: killer, Floor: 1}
}

// A kill awards its experience, in full, to every member alive and un-escaped
// at that moment; the dead and escaped get nothing for it but keep what they
// had. FS-BDA7X §Requirements 9, 12; §Edge States "Kill on the same tick the
// player dies".
func TestKillExperience_AwardsEveryLivingUnescapedMember(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(m member)
		want    int
	}{
		{"alive", func(member) {}, 50 + 10},
		{"dead", func(m member) { m.body.health.CurrentHealth = 0 }, 50},
		{"escaped", func(m member) { m.body.player.Escape = true }, 50},
		{"left behind", func(m member) { m.body.health.CurrentHealth = 0; m.body.player.LeftBehind = true }, 50},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			killer := seatMember(t, s, types.CharacterInPlay{Name: "Wren", Class: "warrior"})
			other := seatMember(t, s, types.CharacterInPlay{Name: "Kaelen", Class: "mage", Experience: 50})
			tt.resolve(other)

			s.publishKills([]systems.KillRecord{ghoulKilledBy(killer.id)})

			assert.Equal(t, 10, killer.body.stats.Experience, "the killer gets the same share, no more")
			assert.Equal(t, tt.want, other.body.stats.Experience)
		})
	}
}

// A death with no player killer awards nothing. FS-BDA7X §Requirements 9.
func TestKillExperience_NoPlayerKiller_AwardsNothing(t *testing.T) {
	s := unstartedRun(t)
	m := seatMember(t, s, types.CharacterInPlay{Name: "Wren", Class: "warrior"})

	s.publishKills([]systems.KillRecord{ghoulKilledBy(uuid.Nil)})

	assert.Equal(t, 0, m.body.stats.Experience)
}

// Crossing thresholds levels up in the same award, once per level crossed, with
// the class growth each time; max HP / MP grow, current HP / MP do not. Level
// stops at the cap while experience keeps accumulating. FS-BDA7X §Requirements
// 8, 16–17, 19; §Edge States "Demon kill at low level", "At the cap".
func TestKillExperience_LevelsUpInTheSameAward(t *testing.T) {
	demon := func(level int) systems.KillRecord {
		return systems.KillRecord{Archetype: components.MonsterArchetypeDemon, Level: level, Boss: true}
	}
	ghoul := systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 1}

	tests := []struct {
		name               string
		class              string
		level, experience  int
		kill               systems.KillRecord
		wantLevel, wantExp int
		str, agi, int, vit int // growth over the seat
		maxHP, maxMP       int // growth over the seat
	}{
		{"below the threshold", "warrior", 1, 80, ghoul, 1, 90, 0, 0, 0, 0, 0, 0},
		{"onto the threshold", "warrior", 1, 90, ghoul, 2, 100, 2, 0, 0, 2, 12, 2},
		{"a demon crosses two levels", "mage", 1, 0, demon(1), 3, 250, 0, 0, 6, 0, 12, 20},
		{"a demon crosses three levels", "archer", 2, 200, demon(5), 5, 600, 0, 9, 0, 0, 24, 15},
		{"onto the cap", "warrior", 19, 38525, ghoul, 20, 38535, 2, 0, 0, 2, 12, 2},
		{"at the cap experience accumulates", "warrior", 20, 40000, demon(10), 20, 40000 + 588, 0, 0, 0, 0, 0, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			m := seatMember(t, s, types.CharacterInPlay{Name: "Wren", Class: tt.class, Level: tt.level, Experience: int64(tt.experience)})
			seated := *m.body.stats
			seatedMaxHP, seatedMaxMP := m.body.health.MaxHealth, m.body.mana.MaxMana
			// wounded and drained, so a heal would show
			m.body.health.CurrentHealth, m.body.mana.CurrentMana = 7, 3

			tt.kill.KillerMemberID = m.id
			s.publishKills([]systems.KillRecord{tt.kill})

			stats := m.body.stats
			assert.Equal(t, tt.wantLevel, stats.Level, "level")
			assert.Equal(t, tt.wantExp, stats.Experience, "experience")
			assert.Equal(t, tt.str, stats.Strength-seated.Strength, "strength growth")
			assert.Equal(t, tt.agi, stats.Agility-seated.Agility, "agility growth")
			assert.Equal(t, tt.int, stats.Intelligence-seated.Intelligence, "intelligence growth")
			assert.Equal(t, tt.vit, stats.Vitality-seated.Vitality, "vitality growth")
			assert.Equal(t, tt.maxHP, m.body.health.MaxHealth-seatedMaxHP, "max HP growth")
			assert.Equal(t, tt.maxMP, m.body.mana.MaxMana-seatedMaxMP, "max MP growth")
			assert.Equal(t, 7, m.body.health.CurrentHealth, "no heal on level-up")
			assert.Equal(t, 3, m.body.mana.CurrentMana, "no mana refill on level-up")
		})
	}
}

// The run's tally holds each member's gain with their character, and outlives
// the member's entity. FS-BDA7X §Requirements 23.
func TestKillExperience_TallyOutlivesTheMembersEntity(t *testing.T) {
	s := unstartedRun(t)
	characterID := uuid.New()
	m := seatMember(t, s, types.CharacterInPlay{ID: characterID, Name: "Wren", Class: "warrior"})

	s.publishKills([]systems.KillRecord{ghoulKilledBy(m.id), ghoulKilledBy(m.id)})
	s.RemovePlayer(m.id.String())
	s.publishKills([]systems.KillRecord{ghoulKilledBy(m.id)})

	assert.Equal(t, []ExperienceGain{{MemberID: m.id, CharacterID: characterID, Amount: 20}}, s.runExperience.Gains())
}

// A ghoul slain in a run's tick feeds the whole living party on that tick.
// FS-BDA7X §Requirements 9, 16.
func TestRun_SlainGhoulFeedsThePartyOnTheTick(t *testing.T) {
	s := unstartedRun(t)
	delver, killer := placeDelver(t, s, "warrior", 500, 500)
	_, ally := placeDelver(t, s, "mage", 590, 500)
	g := frailGhoul(s, 545, 500)
	// rooted, so the test alone decides where it stands
	g.RemoveComponent(ecs.ComponentTypeVelocity)

	require.NoError(t, s.handleAttack(delver, g.ID))
	tick(s)

	for _, e := range []*ecs.Entity{killer, ally} {
		sc, _ := e.GetComponent(ecs.ComponentTypeStats)
		assert.Equal(t, 10, sc.(*components.StatsComponent).Experience)
	}
}
