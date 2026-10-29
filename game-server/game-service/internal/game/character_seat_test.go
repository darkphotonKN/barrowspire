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

// seatedBody is what a character's seat built: its stats, health and class
// resource.
type seatedBody struct {
	stats    *components.StatsComponent
	health   *components.HealthComponent
	resource *components.ResourceComponent
	player   *components.PlayerComponent
}

func seat(t *testing.T, s *Session, character types.CharacterInPlay) seatedBody {
	t.Helper()

	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(uuid.New(), character, ""))
	require.True(t, ok)

	sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	rc, _ := entity.GetComponent(ecs.ComponentTypeResource)
	pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)

	return seatedBody{
		stats:    sc.(*components.StatsComponent),
		health:   hc.(*components.HealthComponent),
		resource: rc.(*components.ResourceComponent),
		player:   pc.(*components.PlayerComponent),
	}
}

// A character is seated with the stats for its level: class base plus
// (level − 1) × class growth, at full HP and a full class resource. Only a mana
// pool grows with level; stamina stays 100. FS-BDA7X §Requirements 18–19;
// FS-8AY7S §Requirements 15.
func TestAddPlayer_SeatsTheCharacterAtItsLevel(t *testing.T) {
	tests := []struct {
		name                 string
		class                string
		level                int
		str, agi, intel, vit int
		maxHP, maxMP         int
	}{
		{"level-1 warrior is the class preset", "warrior", 1, 8, 4, 2, 9, 150, 100},
		{"level-5 warrior", "warrior", 5, 16, 4, 2, 17, 198, 100},
		{"level-5 archer", "archer", 5, 4, 20, 3, 5, 132, 100},
		{"level-5 mage", "mage", 5, 2, 3, 21, 3, 124, 190},
		{"level 0 seats as level 1", "mage", 0, 2, 3, 9, 3, 100, 150},
		{"above the cap seats at the cap", "warrior", 25, 46, 4, 2, 47, 378, 100},
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
			assert.Equal(t, tt.maxMP, body.resource.Max, "max class resource")
			assert.Equal(t, tt.maxMP, body.resource.Current, "seated at a full class resource")
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
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "mage", Level: 3}, "")
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Kaelen", Class: "warrior", Level: 7}, "")

	assert.Equal(t, 7, partyLevel(delversOf(s.EntityManager.GetAllEntities())))
}

// bodyOf is the member's body in a world, as seated.
func bodyOf(t *testing.T, s *Session, memberID uuid.UUID) seatedBody {
	t.Helper()

	entity, ok := s.EntityManager.GetEntity(s.playerIDToEntitiesID[memberID])
	require.True(t, ok, "the member has no body here")

	sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	rc, _ := entity.GetComponent(ecs.ComponentTypeResource)
	pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)

	return seatedBody{
		stats:    sc.(*components.StatsComponent),
		health:   hc.(*components.HealthComponent),
		resource: rc.(*components.ResourceComponent),
		player:   pc.(*components.PlayerComponent),
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

	require.NoError(t, hub.Admit(member, warrior, ""))
	require.NoError(t, hub.Admit(member, mage, ""))

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

	require.NoError(t, hub.Admit(member, warrior, ""))
	before := hub.playerIDToEntitiesID[member]
	require.NoError(t, hub.Admit(member, warrior, ""))

	assert.Equal(t, before, hub.playerIDToEntitiesID[member])
}

// A run is fixed to the character that entered it: switching mid-run is
// refused and the body stays as it was. FS-BDA7X §Requirements 7.
func TestAdmit_RunAsAnotherCharacter_IsRefused(t *testing.T) {
	run := unstartedRun(t)
	member := uuid.New()
	warrior := types.CharacterInPlay{ID: uuid.New(), Name: "Kaelen", Class: "warrior", Level: 5}
	run.AddPlayer(member, warrior, "")

	err := run.Admit(member, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "mage", Level: 1}, "")

	assert.ErrorIs(t, err, ErrCharacterSwitchMidRun)
	assert.Equal(t, warrior.ID, bodyOf(t, run, member).player.CharacterID)
}

// Each class is seated with its own class resource, full, and names its
// ability, whose cost is read from the attack table. FS-8AY7S §Requirements
// 1, 3–4, 9, 12.
func TestAddPlayer_SeatsEachClassWithItsOwnResource(t *testing.T) {
	tests := []struct {
		class       string
		kind        components.ResourceKind
		max, regen  int
		ability     components.AttackKind
		abilityCost int
	}{
		{"warrior", components.ResourceStamina, 100, 20, components.AttackDash, 25},
		{"archer", components.ResourceStamina, 100, 20, components.AttackShadowShot, 90},
		{"mage", components.ResourceMana, 150, 4, components.AttackTripleFireball, 15},
	}

	for _, tt := range tests {
		t.Run(tt.class, func(t *testing.T) {
			s := unstartedRun(t)

			body := seat(t, s, types.CharacterInPlay{Name: "Wren", Class: tt.class, Level: 1})

			assert.Equal(t, tt.kind, body.resource.Kind)
			assert.Equal(t, tt.max, body.resource.Max)
			assert.Equal(t, tt.max, body.resource.Current, "seated full")
			assert.Equal(t, tt.regen, body.resource.RegenPerSecond)
			assert.Equal(t, tt.ability, Classes[tt.class].Ability)
			assert.Equal(t, tt.abilityCost, systems.AttackCost(Classes[tt.class].Ability))
		})
	}
}

// A mercenary character in play is seated as a mercenary, never through the
// unknown-class fallback: its own stats, health and combat, its cut, and 0 of 3
// parry charges as its only class resource. FS-MAMHR §Requirements 2–3.
func TestAddPlayer_SeatsAMercenary(t *testing.T) {
	tests := []struct {
		name                 string
		level                int
		str, agi, intel, vit int
		maxHP                int
	}{
		{"level 1 is the class preset", 1, 7, 7, 2, 7, 130},
		{"level 5", 5, 11, 15, 2, 7, 170},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			entity, ok := s.EntityManager.GetEntity(s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "mercenary", Level: tt.level}, ""))
			require.True(t, ok)

			pc, _ := entity.GetComponent(ecs.ComponentTypePlayer)
			assert.Equal(t, "mercenary", pc.(*components.PlayerComponent).Class)

			sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
			stats := sc.(*components.StatsComponent)
			assert.Equal(t, tt.str, stats.Strength, "strength")
			assert.Equal(t, tt.agi, stats.Agility, "agility")
			assert.Equal(t, tt.intel, stats.Intelligence, "intelligence")
			assert.Equal(t, tt.vit, stats.Vitality, "vitality")

			hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
			health := hc.(*components.HealthComponent)
			assert.Equal(t, tt.maxHP, health.MaxHealth, "max HP")
			assert.Equal(t, tt.maxHP, health.CurrentHealth, "seated at full HP")

			cc, _ := entity.GetComponent(ecs.ComponentTypeCombat)
			assert.Equal(t, components.CombatComponent{Attack: 12, Defense: 7, AttackSpeed: 1.2, AttackRange: 1}, *cc.(*components.CombatComponent))

			kc, _ := entity.GetComponent(ecs.ComponentTypeSkill)
			assert.Equal(t, "cut", kc.(*components.SkillComponent).SkillName, "starting skill")

			rc, _ := entity.GetComponent(ecs.ComponentTypeResource)
			pool := rc.(*components.ResourceComponent)
			assert.Equal(t, components.ResourceParryCharges, pool.Kind, "no mana, no stamina")
			assert.Equal(t, 3, pool.Max)
			assert.Equal(t, 0, pool.Current, "seated at 0 of 3")
			assert.Equal(t, 0, pool.RegenPerSecond)
		})
	}
}

// A mercenary's parry charges are seated at 0, and nothing raises them on their
// own across ticks. FS-8AY7S §Requirements 3–5; FS-MAMHR §Requirements 2, 19.
func TestAddPlayer_MercenaryParryChargesNeverRegenerate(t *testing.T) {
	s := unstartedRun(t)
	_, merc := placeDelver(t, s, "mercenary", 500, 500)
	rc, ok := merc.GetComponent(ecs.ComponentTypeResource)
	require.True(t, ok)
	pool := rc.(*components.ResourceComponent)

	for range 300 {
		s.step(1.0/30, s.EntityManager.GetAllEntities())
	}

	assert.Equal(t, 0, pool.Current)
	assert.Equal(t, 3, pool.Max)
}

// Every delver carries exactly one class resource; monsters carry none.
// FS-8AY7S §Requirements 1.
func TestClassResource_OnDelversOnly(t *testing.T) {
	s := unstartedRun(t)
	_, delver := placeDelver(t, s, "mage", 500, 500)
	ghoul := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: 540, Y: 500})

	assert.True(t, delver.HasComponent(ecs.ComponentTypeResource))
	assert.False(t, ghoul.HasComponent(ecs.ComponentTypeResource))
}

// A delver in play regenerates on the world's tick: a warrior drained to 0
// reads 20 after exactly one second of ticks. FS-8AY7S §Requirements 5.
func TestStep_RegeneratesTheClassResource(t *testing.T) {
	s := unstartedRun(t)
	_, warrior := placeDelver(t, s, "warrior", 500, 500)
	rc, _ := warrior.GetComponent(ecs.ComponentTypeResource)
	pool := rc.(*components.ResourceComponent)
	pool.Current = 0

	for range 30 {
		s.step(1.0/30, s.EntityManager.GetAllEntities())
	}

	assert.Equal(t, 20, pool.Current)
}

// A stamina pool never grows with level, whatever the class growth says; only a
// mana pool does. FS-8AY7S §Requirements 15.
func TestClassAtLevel_GrowsOnlyAManaPool(t *testing.T) {
	tests := []struct {
		name string
		kind components.ResourceKind
		want int
	}{
		{"mana grows", components.ResourceMana, 100 + 4*10},
		{"stamina does not", components.ResourceStamina, 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			class := Classes["warrior"]
			class.Resource = components.ResourceComponent{Kind: tt.kind, Max: 100}
			class.Growth.MaxMana = 10

			body := classAtLevel(class, 5)

			assert.Equal(t, tt.want, body.Resource.Max)
			assert.Equal(t, tt.want, body.Resource.Current, "seated full")
		})
	}
}

// Class growth: the warrior, archer and mercenary gain no class resource with
// level; the mage gains +10 mana. FS-8AY7S §Requirements 15.
func TestClasses_ResourceGrowth(t *testing.T) {
	assert.Equal(t, 0, Classes["warrior"].Growth.MaxMana)
	assert.Equal(t, 0, Classes["archer"].Growth.MaxMana)
	assert.Equal(t, 10, Classes["mage"].Growth.MaxMana)
	assert.Equal(t, 0, Classes["mercenary"].Growth.MaxMana)
}
