package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The monster AI rolls from the source the session was built with on every
// floor: floor 1's AI, which paths, and a fallback floor's, which steers straight, both
// draw their wander picks from it, so a floor change never swaps the global
// source back in. FS-KE075 §D R25, ADR-0062.
func TestFloorChange_MonsterAIKeepsTheInjectedRoll(t *testing.T) {
	rolls := 0
	roll := func() float64 { rolls++; return 0.5 }
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds(),
		withMonsterRoll(roll))
	s.spawnRand = seededSpawns(3)
	s.InitialSystems()
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)

	// long enough for every idle monster to pause and pick where to wander
	pause := constants.MonsterPauseSeconds
	ticks := int(3 * pause * float64(constants.GameFrameRate))
	dt := 1.0 / float64(constants.GameFrameRate)
	for floor := firstFloor; floor <= firstFloor+1; floor++ {
		if floor > firstFloor {
			failGeneration(s)
			require.NoError(t, s.regenerateFloor())
		}
		require.Equal(t, floor == firstFloor, s.dungeon != nil, "floor %d", floor)
		before := rolls
		for range ticks {
			s.monsterAISystem.Update(dt, s.EntityManager.GetAllEntities())
		}
		assert.Greater(t, rolls, before, "floor %d's monster AI rolls from the injected source", floor)
	}
}

// The Bone Archer's sheet is the owner's table, to the number: frailer and
// slower than the ghoul, shooting a bone arrow from 320 px. FS-B4SG9 §A R2.
func TestBoneArcherSheet_CarriesItsNumbers(t *testing.T) {
	assert.Equal(t, "bone_archer", string(components.MonsterArchetypeBoneArcher))

	sheet, ok := monsterSheets[components.MonsterArchetypeBoneArcher]
	require.True(t, ok, "the Bone Archer has a sheet")
	assert.Equal(t, monsterSheet{
		Name: "Bone Archer", HP: 30, Damage: 7,
		AttackInterval: 2.0, WindUp: 0.6, AttackRange: 320, MoveSpeed: 130,
		Defense: 2, MagicResistance: 0,
		AggroRadius: 360, LeashRadius: 560,
		Shot: monsterShot{ProjectileType: "bone_arrow", Speed: 420, Radius: 8, MaxFlight: 850},
	}, sheet)
}

// Which archetypes shoot is sheet data, and the Bone Archer's is the only
// sheet with a shot: every other one strikes in melee as before. FS-B4SG9 §A R1.
func TestMonsterSheets_OnlyTheBoneArcherCarriesAShot(t *testing.T) {
	for archetype, sheet := range monsterSheets {
		if archetype == components.MonsterArchetypeBoneArcher {
			continue
		}
		assert.Equal(t, monsterShot{}, sheet.Shot, "%s has no shot", archetype)
	}
}

// A level-1 Bone Archer spawns with its sheet's numbers, its shot copied onto
// its component with its timings. FS-B4SG9 §A R1, R2.
func TestCreateMonsterEntity_BoneArcherCarriesItsShot(t *testing.T) {
	m := CreateMonsterEntity(ecs.NewEntityManager(), MonsterConfig{Archetype: components.MonsterArchetypeBoneArcher, Level: 1, X: 300, Y: 200})

	assert.Equal(t, monsterStats{HP: 30, Damage: 7, Defense: 2, MagicResistance: 0}, statsOf(t, m))
	vc, ok := m.GetComponent(ecs.ComponentTypeVelocity)
	require.True(t, ok)
	assert.Equal(t, 130.0, vc.(*components.VelocityComponent).Speed)

	monster := monsterOf(m)
	assert.Equal(t, "Bone Archer", monster.Name)
	assert.Equal(t, 2.0, monster.AttackInterval)
	assert.Equal(t, 0.6, monster.WindUp)
	assert.Equal(t, 320.0, monster.AttackRange)
	assert.Equal(t, 360.0, monster.AggroRadius)
	assert.Equal(t, 560.0, monster.LeashRadius)
	assert.Equal(t, "bone_arrow", monster.ShotProjectileType)
	assert.Equal(t, 420.0, monster.ShotSpeed)
	assert.Equal(t, 8.0, monster.ShotRadius)
	assert.Equal(t, 850.0, monster.ShotMaxFlight)
}

// A monster whose sheet has no shot spawns with none on its component.
// FS-B4SG9 §A R1.
func TestCreateMonsterEntity_MeleeMonsterCarriesNoShot(t *testing.T) {
	m := CreateMonsterEntity(ecs.NewEntityManager(), MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: 300, Y: 200})

	monster := monsterOf(m)
	assert.Empty(t, monster.ShotProjectileType)
	assert.Zero(t, monster.ShotSpeed)
	assert.Zero(t, monster.ShotRadius)
	assert.Zero(t, monster.ShotMaxFlight)
}

// An elite Bone Archer is promoted as any standard monster is: a drawn prefix
// on its two-word name, ×2.5 HP and ×1.5 damage, nothing else changed.
// FS-B4SG9 §A R3; FS-77AB6 §Requirements 23.
func TestRollAs_EliteBoneArcherIsDreadAndTakesTheEliteMultipliers(t *testing.T) {
	config := rollAs(fixedRand{0}, components.MonsterArchetypeBoneArcher, 2, 1, 1)
	require.True(t, config.Elite)
	assert.Equal(t, "Dread Bone Archer", config.Name)
	require.Equal(t, 1, config.Level, "party level 2 at the spread's low end")

	m := CreateMonsterEntity(ecs.NewEntityManager(), config)

	// round(30 × 2.5) and round(7 × 1.5)
	assert.Equal(t, monsterStats{HP: 75, Damage: 11, Defense: 2, MagicResistance: 0}, statsOf(t, m))
	monster := monsterOf(m)
	assert.True(t, monster.Elite)
	assert.Equal(t, "Dread Bone Archer", monster.Name)
	assert.Equal(t, "bone_arrow", monster.ShotProjectileType)
}
