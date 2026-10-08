package game

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// killSpy is an in-process kill consumer that keeps what it is told.
type killSpy struct {
	records []systems.KillRecord
}

func (k *killSpy) ConsumeKill(record systems.KillRecord) {
	k.records = append(k.records, record)
}

// watchedRun is an unstarted run with a kill consumer subscribed.
func watchedRun(t *testing.T) (*Session, *killSpy) {
	t.Helper()
	s := unstartedRun(t)
	spy := &killSpy{}
	s.SubscribeKills(spy)
	return s, spy
}

// frailGhoul is a ghoul one hit from death, standing at (x, y).
func frailGhoul(s *Session, x, y float64) *ecs.Entity {
	g := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: x, Y: y})
	hc, _ := g.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1
	return g
}

func memberOf(t *testing.T, e *ecs.Entity) uuid.UUID {
	t.Helper()
	pc, ok := e.GetComponent(ecs.ComponentTypePlayer)
	require.True(t, ok)
	return pc.(*components.PlayerComponent).MemberID
}

func tickFor(s *Session, seconds float64) {
	for i := 0; i < int(math.Round(seconds*float64(constants.GameFrameRate))); i++ {
		tick(s)
	}
}

// Every damage source a delver has can kill a monster, and each kill is recorded
// once, credited to that delver. FS-77AB6 §Requirements 10–11, 28–29.
func TestRun_EveryDamageSourceKillsAMonsterOnce(t *testing.T) {
	tests := []struct {
		name  string
		class string
		act   func(s *Session, delver uuid.UUID, ghoul uuid.UUID) error
	}{
		{"targeted attack", "warrior", func(s *Session, d, g uuid.UUID) error { return s.handleAttack(d, g) }},
		{"slash", "warrior", func(s *Session, d, _ uuid.UUID) error { return s.handleCastSkill(d, "slash", 600, 500) }},
		{"arrow", "archer", func(s *Session, d, _ uuid.UUID) error { return s.handleCastSkill(d, "arrow", 600, 500) }},
		{"fireball", "mage", func(s *Session, d, _ uuid.UUID) error { return s.handleCastSkill(d, "fireball", 600, 500) }},
		{"triple arrow", "archer", func(s *Session, d, _ uuid.UUID) error { return s.handleCastSkill(d, "triple_arrow", 600, 500) }},
		{"triple fireball", "mage", func(s *Session, d, _ uuid.UUID) error { return s.handleCastSkill(d, "triple_fireball", 600, 500) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, spy := watchedRun(t)
			delver, entity := placeDelver(t, s, tt.class, 500, 500)
			g := frailGhoul(s, 545, 500)

			require.NoError(t, tt.act(s, delver, g.ID))
			tickFor(s, 1)

			require.Len(t, spy.records, 1)
			assert.Equal(t, g.ID, spy.records[0].MonsterEntityID)
			assert.Equal(t, memberOf(t, entity), spy.records[0].KillerMemberID)
		})
	}
}

// Two delvers' lethal hits land on one ghoul in the same tick: one kill record.
// FS-77AB6 §Edge States "Concurrent kills".
func TestRun_TwoLethalHitsInOneTick_OneKillRecord(t *testing.T) {
	s, spy := watchedRun(t)
	first, firstEntity := placeDelver(t, s, "warrior", 500, 500)
	second, secondEntity := placeDelver(t, s, "warrior", 590, 500)
	g := frailGhoul(s, 545, 500)

	require.NoError(t, s.handleAttack(first, g.ID))
	require.NoError(t, s.handleAttack(second, g.ID))
	tick(s)

	require.Len(t, spy.records, 1)
	assert.Contains(t, []uuid.UUID{memberOf(t, firstEntity), memberOf(t, secondEntity)}, spy.records[0].KillerMemberID)

	tickFor(s, 1)
	assert.Len(t, spy.records, 1, "a corpse is never recorded again")
}

// A dead monster lies broadcast as dead for its corpse lifetime, then is gone.
func TestRun_CorpseIsBroadcastDeadThenRemoved(t *testing.T) {
	s, _ := watchedRun(t)
	delver, _ := placeDelver(t, s, "warrior", 500, 500)
	g := frailGhoul(s, 545, 500)
	stateSerializer := serializer.NewStateSerializer(s.EntityManager)

	broadcastAction := func() (string, bool) {
		backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
		require.NoError(t, err)
		for _, m := range stateSerializer.FormatStateToClientState(backendState, delver).Monsters {
			if m.EntityID == g.ID {
				return m.Action, true
			}
		}
		return "", false
	}

	require.NoError(t, s.handleAttack(delver, g.ID))
	tick(s)
	action, present := broadcastAction()
	require.True(t, present)
	assert.Equal(t, "dead", action)

	tickFor(s, MonsterCorpseLifetime-0.25)
	action, present = broadcastAction()
	require.True(t, present, "still lying there just short of its lifetime")
	assert.Equal(t, "dead", action)

	tickFor(s, 0.5)
	_, present = broadcastAction()
	assert.False(t, present, "removed once its lifetime is up")
	_, exists := s.EntityManager.GetEntity(g.ID)
	assert.False(t, exists)
}

// A corpse is not a target: the targeted attack whiffs (no cooldown spent) and a
// projectile passes over it to what lies beyond.
func TestRun_CorpseIsUntargetableAndProjectilesPassThrough(t *testing.T) {
	s, _ := watchedRun(t)
	archer, archerEntity := placeDelver(t, s, "archer", 500, 500)
	corpse := frailGhoul(s, 545, 500)
	beyond := unarmoredTarget(s, 640, 500)

	require.NoError(t, s.handleAttack(archer, corpse.ID))
	tick(s)
	require.Equal(t, 0, currentHealth(corpse))
	tickFor(s, 1) // cooldown clears

	require.NoError(t, s.handleAttack(archer, corpse.ID))
	tick(s)
	cc, _ := archerEntity.GetComponent(ecs.ComponentTypeCooldown)
	assert.Zero(t, cc.(*components.CooldownComponent).Remaining[components.AttackTargeted], "a swing at a corpse is no swing")

	require.NoError(t, s.handleCastSkill(archer, "arrow", 700, 500))
	tickFor(s, 1)
	assert.Less(t, currentHealth(beyond), 1000, "the arrow flew over the corpse")
}

// A corpse does not block: a delver walks through where it lies.
func TestRun_CorpseDoesNotBlockMovement(t *testing.T) {
	s, _ := watchedRun(t)
	delver, entity := placeDelver(t, s, "warrior", 500, 500)
	g := frailGhoul(s, 545, 500)

	require.NoError(t, s.handleAttack(delver, g.ID))
	tick(s)
	require.Equal(t, 0, currentHealth(g))

	require.NoError(t, s.handleMove(delver, 1, 0))
	tickFor(s, 0.5)

	tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
	assert.Greater(t, tc.(*components.TransformComponent).X, 560.0, "walked past where the corpse lies")
}

// A projectile fired by a delver who dies before it lands still kills, and still
// credits them. FS-77AB6 §Requirements 9.
func TestRun_KillCreditGoesToAProjectileOwnerWhoDiedFirst(t *testing.T) {
	s, spy := watchedRun(t)
	mage, mageEntity := placeDelver(t, s, "mage", 500, 500)
	g := frailGhoul(s, 700, 500)
	// rooted: once the mage is gone it would wander off the shot's line
	g.RemoveComponent(ecs.ComponentTypeVelocity)
	killer := memberOf(t, mageEntity)

	require.NoError(t, s.handleCastSkill(mage, "fireball", 800, 500))
	tick(s) // fired
	s.EntityManager.RemoveEntity(mageEntity.ID)

	tickFor(s, 1)
	require.Len(t, spy.records, 1)
	assert.Equal(t, g.ID, spy.records[0].MonsterEntityID)
	assert.Equal(t, killer, spy.records[0].KillerMemberID)
}

// The v1 consumer is a structured log line carrying the whole record.
func TestKillLog_WritesEveryFieldOfTheRecord(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	record := systems.KillRecord{
		MonsterEntityID: uuid.New(), Archetype: components.MonsterArchetypeTroll, Level: 4,
		Elite: true, Boss: false, KillerMemberID: uuid.New(), X: 120, Y: 340, Floor: 2,
	}

	NewKillLog(logger).ConsumeKill(record)

	var line map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &line))
	assert.Equal(t, "monster killed", line["msg"])
	assert.Equal(t, record.MonsterEntityID.String(), line["monster_entity_id"])
	assert.Equal(t, "troll", line["archetype"])
	assert.EqualValues(t, 4, line["level"])
	assert.Equal(t, true, line["elite"])
	assert.Equal(t, false, line["boss"])
	assert.Equal(t, record.KillerMemberID.String(), line["killer_member_id"])
	assert.EqualValues(t, 120, line["x"])
	assert.EqualValues(t, 340, line["y"])
	assert.EqualValues(t, 2, line["floor"])
}
