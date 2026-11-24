package game

import (
	"maps"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §C R13, R15, §D R17, §E R23, §F R34. I-X2CMM-3.

func castLevitate(s *Session, playerID uuid.UUID, targetID string) error {
	return s.castSkill(playerID, types.PlayerCastSkillPayload{SkillID: "levitate", TargetID: targetID})
}

func afloatOn(t *testing.T, delver *ecs.Entity) bool {
	t.Helper()
	_, on := bookOf(t, delver).States[components.BookStateAfloat]
	return on
}

// bookStateNames are the named states a recipient's frame shows on the
// player with the id, in current_player or other_players.
func bookStateNames(t *testing.T, s *Session, recipient, of uuid.UUID) []string {
	t.Helper()
	frame := frameOf(t, s, types.WorldTypeRun, recipient)
	players := []any{frame["current_player"]}
	if others, ok := frame["other_players"].([]any); ok {
		players = append(players, others...)
	}
	for _, p := range players {
		player := p.(map[string]any)
		if player["id"] != of.String() {
			continue
		}
		var names []string
		states, _ := player["book_states"].([]any)
		for _, st := range states {
			names = append(names, st.(map[string]any)["name"].(string))
		}
		return names
	}
	t.Fatalf("player %s not in %s's frame", of, recipient)
	return nil
}

// levitateParty is a run with a level-9 mage at (500, 500) and a warrior
// teammate cells off along +x.
func levitateParty(t *testing.T, cells float64) (s *Session, mage uuid.UUID, mageBody *ecs.Entity, mate uuid.UUID, mateBody *ecs.Entity) {
	t.Helper()
	s = unstartedRun(t)
	s.endSessionCh = make(chan bool, 64)
	mage, mageBody = placeDelverAt(t, s, "mage", 9, 500, 500)
	mate, mateBody = placeDelverAt(t, s, "warrior", 9, 500+cells*cell, 500)
	return s, mage, mageBody, mate, mateBody
}

// A level-9 mage levitates a teammate 4 cells off by their player id: after
// 1.5 s 35 mana is paid, the 90 s cooldown starts and the teammate is afloat
// for 8 s, shown on their own state and on everyone else's; their slash is
// refused while it runs and lands after. AC 1; R13, R23, R34.
func TestCastSkill_LevitateLiftsATeammateWhoCannotSlashFor8Seconds(t *testing.T) {
	s, mage, mageBody, mate, mateBody := levitateParty(t, 4)
	manaBefore := currentResource(mageBody)

	require.NoError(t, castLevitate(s, mage, mate.String()))
	ticks(s, castTicks(1.5)-1)
	assert.False(t, afloatOn(t, mateBody), "not before the cast completes")
	assert.Equal(t, manaBefore, currentResource(mageBody), "nothing paid yet")
	tick(s)

	assert.Equal(t, manaBefore-35, currentResource(mageBody), "35 mana")
	assert.Equal(t, components.BookCooldown{Remaining: 90, Total: 90}, bookOf(t, mageBody).Cooldowns[components.PageLevitate])
	require.True(t, afloatOn(t, mateBody))
	assert.False(t, afloatOn(t, mageBody), "the mage stays grounded")
	assert.Contains(t, bookStateNames(t, s, mate, mate), "afloat", "on the teammate's own state")
	assert.Contains(t, bookStateNames(t, s, mage, mate), "afloat", "on the teammate in the mage's other_players")
	assert.NotContains(t, bookStateNames(t, s, mage, mage), "afloat")

	at := transformOf(t, mateBody)
	target := unarmoredTarget(s, at.X+40, at.Y)
	require.NoError(t, s.handleCastSkill(mate, "slash", at.X+100, at.Y))
	tick(s)
	assert.Equal(t, 1000, currentHealth(target), "an afloat slash is refused")
	assert.False(t, mateBody.HasComponent(ecs.ComponentTypeAttackPin), "and pins nothing")

	ticks(s, castTicks(8)-2)
	assert.True(t, afloatOn(t, mateBody), "afloat until 8 s")
	ticks(s, 2)
	require.False(t, afloatOn(t, mateBody), "grounded after 8 s")
	assert.NotContains(t, bookStateNames(t, s, mage, mate), "afloat")

	require.NoError(t, s.handleCastSkill(mate, "slash", at.X+100, at.Y))
	tick(s)
	assert.Less(t, currentHealth(target), 1000, "the slash lands again")
}

// An afloat delver still drinks the potion and casts their own pages. R23.
func TestCastSkill_AnAfloatDelverStillCastsTheirBook(t *testing.T) {
	s, _, _, mate, mateBody := levitateParty(t, 4)
	bookOf(t, mateBody).States[components.BookStateAfloat] = 8

	require.NoError(t, castPageSkill(s, mate, "hardened"))

	_, hardened := hardenedLeft(t, mateBody)
	assert.True(t, hardened, "a book ability works afloat")
}

// The mage levitates themself by their own id. A teammate 7 cells off, a dead
// or escaped teammate, an unknown id and a monster's id are refused with
// nothing spent. A teammate's entity id names them as their player id does.
// AC 2; R13, R15.
func TestCastSkill_LevitateTargets(t *testing.T) {
	tests := []struct {
		name   string
		cells  float64
		ready  func(t *testing.T, s *Session, mage, mate *ecs.Entity) string
		lifted func(mage, mate *ecs.Entity) *ecs.Entity
	}{
		{name: "self by the mage's own id", cells: 4,
			ready: func(_ *testing.T, _ *Session, mage, _ *ecs.Entity) string {
				return playerOf(mage).MemberID.String()
			},
			lifted: func(mage, _ *ecs.Entity) *ecs.Entity { return mage }},
		{name: "a teammate by their entity id", cells: 4,
			ready:  func(_ *testing.T, _ *Session, _, mate *ecs.Entity) string { return mate.ID.String() },
			lifted: func(_, mate *ecs.Entity) *ecs.Entity { return mate }},
		{name: "a teammate 7 cells off", cells: 7,
			ready: func(_ *testing.T, _ *Session, _, mate *ecs.Entity) string { return playerOf(mate).MemberID.String() }},
		{name: "a dead teammate", cells: 4,
			ready: func(t *testing.T, _ *Session, _, mate *ecs.Entity) string {
				kill(t, mate)
				return playerOf(mate).MemberID.String()
			}},
		{name: "an escaped teammate", cells: 4,
			ready: func(_ *testing.T, _ *Session, _, mate *ecs.Entity) string {
				playerOf(mate).Escape = true
				return playerOf(mate).MemberID.String()
			}},
		{name: "an unknown id", cells: 4,
			ready: func(*testing.T, *Session, *ecs.Entity, *ecs.Entity) string { return uuid.NewString() }},
		{name: "no id", cells: 4,
			ready: func(*testing.T, *Session, *ecs.Entity, *ecs.Entity) string { return "" }},
		{name: "a monster's id", cells: 4,
			ready: func(_ *testing.T, s *Session, _, _ *ecs.Entity) string {
				return unarmoredTarget(s, 500+2*cell, 500).ID.String()
			}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, mage, mageBody, _, mateBody := levitateParty(t, tt.cells)
			targetID := tt.ready(t, s, mageBody, mateBody)
			manaBefore := currentResource(mageBody)

			require.NoError(t, castLevitate(s, mage, targetID))

			if tt.lifted == nil {
				assert.Nil(t, bookOf(t, mageBody).Casting, "refused")
				ticks(s, castTicks(1.5))
				assert.Equal(t, manaBefore, currentResource(mageBody), "no mana")
				assert.Empty(t, bookOf(t, mageBody).Cooldowns, "no cooldown")
				assert.False(t, afloatOn(t, mageBody) || afloatOn(t, mateBody), "nobody afloat")
				return
			}
			ticks(s, castTicks(1.5))
			assert.True(t, afloatOn(t, tt.lifted(mageBody, mateBody)))
			assert.Equal(t, manaBefore-35, currentResource(mageBody))
		})
	}
}

// A teammate who walks 1 cell further during the cast is still lifted; 2 cells
// further, the cast ends with nothing. AC 3; R17.
func TestCastSkill_LevitateOnATeammateWhoWalksOff(t *testing.T) {
	for _, tt := range []struct {
		name  string
		cells float64
		lifts bool
	}{
		{"1 cell further", 1, true},
		{"2 cells further", 2, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s, mage, mageBody, mate, mateBody := levitateParty(t, 6)
			manaBefore := currentResource(mageBody)
			cooldownsBefore := maps.Clone(bookOf(t, mageBody).Cooldowns)
			require.NoError(t, castLevitate(s, mage, mate.String()))
			ticks(s, 15)

			transformOf(t, mateBody).X += tt.cells * cell
			ticks(s, castTicks(1.5)-15)

			if tt.lifts {
				assert.True(t, afloatOn(t, mateBody))
				assert.Equal(t, manaBefore-35, currentResource(mageBody))
				return
			}
			assert.False(t, afloatOn(t, mateBody), "no afloat")
			assert.Nil(t, bookOf(t, mageBody).Casting, "the cast ended")
			assert.Equal(t, manaBefore, currentResource(mageBody), "no mana")
			assert.Equal(t, cooldownsBefore, bookOf(t, mageBody).Cooldowns, "no cooldown")
		})
	}
}

func playerOf(e *ecs.Entity) *components.PlayerComponent {
	pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
	return pc.(*components.PlayerComponent)
}
