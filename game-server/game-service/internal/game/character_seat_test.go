package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seatedBody is what a character's seat built: its stats, health and mana.
type seatedBody struct {
	stats  *components.StatsComponent
	health *components.HealthComponent
	mana   *components.ManaComponent
	player *components.PlayerComponent
}

func seat(t *testing.T, s *Session, character types.CharacterInPlay) seatedBody {
	t.Helper()

	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(uuid.New(), character))
	require.True(t, ok)

	sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	mc, _ := entity.GetComponent(ecs.ComponentTypeMana)
	pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)

	return seatedBody{
		stats:  sc.(*components.StatsComponent),
		health: hc.(*components.HealthComponent),
		mana:   mc.(*components.ManaComponent),
		player: pc.(*components.PlayerComponent),
	}
}

// A character is seated with the stats for its level: class base plus
// (level − 1) × class growth, at full HP and MP. FS-BDA7X §Requirements 18–19.
func TestAddPlayer_SeatsTheCharacterAtItsLevel(t *testing.T) {
	tests := []struct {
		name                 string
		class                string
		level                int
		str, agi, intel, vit int
		maxHP, maxMP         int
	}{
		{"level-1 warrior is the class preset", "warrior", 1, 8, 4, 2, 9, 150, 50},
		{"level-5 warrior", "warrior", 5, 16, 4, 2, 17, 198, 58},
		{"level-5 archer", "archer", 5, 4, 20, 3, 5, 132, 120},
		{"level-5 mage", "mage", 5, 2, 3, 21, 3, 124, 190},
		{"level 0 seats as level 1", "mage", 0, 2, 3, 9, 3, 100, 150},
		{"above the cap seats at the cap", "warrior", 25, 46, 4, 2, 47, 378, 88},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)

			body := seat(t, s, types.CharacterInPlay{Name: "Wren", Class: tt.class, Level: tt.level})

			assert.Equal(t, tt.str, body.stats.Strength, "strength")
			assert.Equal(t, tt.agi, body.stats.Agility, "agility")
			assert.Equal(t, tt.intel, body.stats.Intelligence, "intelligence")
			assert.Equal(t, tt.vit, body.stats.Vitality, "vitality")
			assert.Equal(t, tt.maxHP, body.health.MaxHealth, "max HP")
			assert.Equal(t, tt.maxHP, body.health.CurrentHealth, "seated at full HP")
			assert.Equal(t, tt.maxMP, body.mana.MaxMana, "max MP")
			assert.Equal(t, tt.maxMP, body.mana.CurrentMana, "seated at full MP")
		})
	}
}

// The seat carries the character's level and experience, and who it is.
// FS-BDA7X §Requirements 7, 18.
func TestAddPlayer_CarriesTheCharactersProgressionAndIdentity(t *testing.T) {
	s := unstartedRun(t)
	characterID := uuid.New()

	body := seat(t, s, types.CharacterInPlay{
		ID: characterID, Name: "Wren", Class: "archer", Level: 5, Experience: 640,
	})

	assert.Equal(t, 5, body.stats.Level)
	assert.Equal(t, 640, body.stats.Experience)
	assert.Equal(t, characterID, body.player.CharacterID)
	assert.Equal(t, "archer", body.player.Class)
	assert.Equal(t, "Wren", body.player.Username)
}

// Monsters are levelled to the party's highest seated level. FS-77AB6 §22.
func TestPartyLevel_IsTheHighestSeatedCharacter(t *testing.T) {
	s := unstartedRun(t)
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "mage", Level: 3})
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Kaelen", Class: "warrior", Level: 7})

	assert.Equal(t, 7, partyLevel(delversOf(s.EntityManager.GetAllEntities())))
}

// bodyOf is the member's body in a world, as seated.
func bodyOf(t *testing.T, s *Session, memberID uuid.UUID) seatedBody {
	t.Helper()

	entity, ok := s.EntityManager.GetEntity(s.playerIDToEntitiesID[memberID])
	require.True(t, ok, "the member has no body here")

	sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	mc, _ := entity.GetComponent(ecs.ComponentTypeMana)
	pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)

	return seatedBody{
		stats:  sc.(*components.StatsComponent),
		health: hc.(*components.HealthComponent),
		mana:   mc.(*components.ManaComponent),
		player: pc.(*components.PlayerComponent),
	}
}

func countDelvers(s *Session) int {
	n := 0
	for _, entity := range s.EntityManager.GetAllEntities() {
		if entity.HasComponent(ecs.ComponentTypePlayer) {
			n++
		}
	}
	return n
}

// Entering the HUB again as another character re-seats the member as that
// character: the body is the new character's, and the old one is gone.
// FS-BDA7X §Requirements 5, 7.
func TestAdmit_HubAsAnotherCharacter_ReseatsTheBody(t *testing.T) {
	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
	member := uuid.New()
	warrior := types.CharacterInPlay{ID: uuid.New(), Name: "Kaelen", Class: "warrior", Level: 5, Experience: 640}
	mage := types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "mage", Level: 1, Experience: 0}

	require.NoError(t, hub.Admit(member, warrior))
	require.NoError(t, hub.Admit(member, mage))

	body := bodyOf(t, hub, member)
	assert.Equal(t, mage.ID, body.player.CharacterID)
	assert.Equal(t, "mage", body.player.Class)
	assert.Equal(t, "Wren", body.player.Username)
	assert.Equal(t, 1, body.stats.Level)
	assert.Equal(t, 0, body.stats.Experience)
	assert.Equal(t, 1, countDelvers(hub), "the warrior's body was left behind")
}

// Entering again as the same character keeps the body it has.
func TestAdmit_HubAsTheSameCharacter_KeepsTheBody(t *testing.T) {
	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
	member := uuid.New()
	warrior := types.CharacterInPlay{ID: uuid.New(), Name: "Kaelen", Class: "warrior", Level: 5}

	require.NoError(t, hub.Admit(member, warrior))
	before := hub.playerIDToEntitiesID[member]
	require.NoError(t, hub.Admit(member, warrior))

	assert.Equal(t, before, hub.playerIDToEntitiesID[member])
}

// A run is fixed to the character that entered it: switching mid-run is
// refused and the body stays as it was. FS-BDA7X §Requirements 7.
func TestAdmit_RunAsAnotherCharacter_IsRefused(t *testing.T) {
	run := unstartedRun(t)
	member := uuid.New()
	warrior := types.CharacterInPlay{ID: uuid.New(), Name: "Kaelen", Class: "warrior", Level: 5}
	run.AddPlayer(member, warrior)

	err := run.Admit(member, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "mage", Level: 1})

	assert.ErrorIs(t, err, ErrCharacterSwitchMidRun)
	assert.Equal(t, warrior.ID, bodyOf(t, run, member).player.CharacterID)
}
