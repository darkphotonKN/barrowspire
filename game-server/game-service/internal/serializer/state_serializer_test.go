package serializer

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// onFloor stands the run-level entity on a floor of the run: one built on a
// cell grid of cellSize px (a dungeon floor, ADR-0061), or on none (0).
func onFloor(em *ecs.EntityManager, depth int, cellSize float64) {
	runLevel := em.CreateEntity()
	floor := components.NewFloorComponent(depth, 3)
	floor.CellSize = cellSize
	runLevel.AddComponent(floor)
}

// addDelver stands a delver at (x, y) with health hp; 0 lies dead.
func addDelver(em *ecs.EntityManager, id uuid.UUID, x, y float64, hp int) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(id, "mage", "delver", false))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 200))
	e.AddComponent(components.NewItemIDListComponent(nil))
	health := components.NewHealthComponent(hp, 100)
	health.IsEliminated = hp <= 0
	e.AddComponent(health)
	return e
}

// addContainer stands a container of kind at (x, y), open or shut.
func addContainer(em *ecs.EntityManager, kind components.ContainerKind, x, y float64, open bool) *ecs.Entity {
	e := em.CreateEntity()
	container := components.NewContainerComponent(uuid.New())
	container.Kind = kind
	e.AddComponent(container)
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewOpenableComponent(open))
	e.AddComponent(components.NewItemIDListComponent(nil))
	return e
}

// addFixedInteractables stands a door, the switch, the escape door and stairs
// at (x, y): what a floor always shows, however far.
func addFixedInteractables(em *ecs.EntityManager, x, y float64) {
	door := em.CreateEntity()
	door.AddComponent(components.NewDoorComponent(40, 10))
	door.AddComponent(components.NewTransformComponent(x, y))

	sw := em.CreateEntity()
	sw.AddComponent(components.NewSwitchComponent(1))
	sw.AddComponent(components.NewTransformComponent(x, y))

	exit := em.CreateEntity()
	exit.AddComponent(components.NewEscapeDoorComponent())
	exit.AddComponent(components.NewTransformComponent(x, y))

	stairs := em.CreateEntity()
	stairs.AddComponent(components.NewStairsComponent())
	stairs.AddComponent(components.NewTransformComponent(x, y))
}

func monsterIDs(state *types.ClientGameState) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(state.Monsters))
	for _, m := range state.Monsters {
		ids = append(ids, m.EntityID)
	}
	return ids
}

func containerIDs(state *types.ClientGameState) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(state.Containers))
	for _, c := range state.Containers {
		ids = append(ids, c.EntityID)
	}
	return ids
}

// On a dungeon floor a recipient is sent the monsters (corpses included), drop
// piles and containers whose centre lies within 1600 px of its body, and every
// player, door, switch, escape door and stairs however far. FS-KE075 §G R36,
// ADR-0060 Decision 4.
func TestFormatStateToClientState_DungeonFloor_CutsDynamicEntitiesToTheInterestRadius(t *testing.T) {
	em := ecs.NewEntityManager()
	onFloor(em, 1, 80)
	me, far := uuid.New(), uuid.New()
	addDelver(em, me, 2000, 2000, 100)
	addDelver(em, far, 5600, 3700, 100)

	near := addMonster(em, "Troll", 2000+1599, 2000, 207, 207)
	corpse := addMonster(em, "Troll", 2000, 2000-1599, 0, 207)
	atEdge := addMonster(em, "Troll", 2000+960, 2000+1280, 207, 207) // exactly 1600
	beyond := addMonster(em, "Troll", 2000+1601, 2000, 207, 207)
	chest := addContainer(em, components.ContainerKindChest, 2000-1599, 2000, true)
	pile := addContainer(em, components.ContainerKindDropPile, 2000, 2000+1601, true)
	sack := addContainer(em, components.ContainerKindSack, 2000+1601, 2000+10, false)
	addFixedInteractables(em, 5700, 3800)

	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	state := s.FormatStateToClientState(backendState, me)

	assert.ElementsMatch(t, []uuid.UUID{near.ID, corpse.ID, atEdge.ID}, monsterIDs(state))
	assert.NotContains(t, monsterIDs(state), beyond.ID)
	assert.ElementsMatch(t, []uuid.UUID{chest.ID}, containerIDs(state))
	assert.NotContains(t, containerIDs(state), pile.ID)
	assert.NotContains(t, containerIDs(state), sack.ID)

	require.Len(t, state.OtherPlayers, 1, "a teammate is always sent")
	assert.Equal(t, far, state.OtherPlayers[0].ID)
	assert.Len(t, state.Doors, 1)
	assert.Len(t, state.Switch, 1)
	assert.Len(t, state.EscapeDoor, 1)
	require.NotNil(t, state.Stairs)
	assert.Len(t, *state.Stairs, 1)

	// the far teammate is cut by its own centre: what lies by it, not by me
	theirs := s.FormatStateToClientState(backendState, far)
	assert.Empty(t, monsterIDs(theirs))
	assert.Empty(t, containerIDs(theirs))
}

// A recipient with no living body here (dead, escaped, left behind) is cut by
// every living, in-play member's body, so a spectator sees what the watched
// teammate sees; with no member alive nothing is cut. FS-KE075 §G R37.
func TestFormatStateToClientState_DungeonFloor_CentresOfARecipientWithoutABody(t *testing.T) {
	type at struct{ x, y float64 }
	byA, byB, byMe := at{2500 + 100, 0}, at{5000, 3000 - 100}, at{0 + 50, 0 + 50}
	dead := func(_ *components.PlayerComponent, h *components.HealthComponent) {
		h.CurrentHealth, h.IsEliminated = 0, true
	}

	tests := []struct {
		name     string
		resolve  func(*components.PlayerComponent, *components.HealthComponent)
		hpA, hpB int
		wantNear []at
	}{
		{"dead, two living members: the union of theirs", dead, 100, 100, []at{byA, byB}},
		{"escaped, one living member: theirs alone",
			func(p *components.PlayerComponent, _ *components.HealthComponent) { p.Escape = true },
			100, 0, []at{byA}},
		{"left behind, one living member: theirs alone",
			func(p *components.PlayerComponent, h *components.HealthComponent) {
				p.LeftBehind = true
				dead(p, h)
			},
			0, 100, []at{byB}},
		{"dead and no member alive: nothing is cut", dead, 0, 0, []at{byA, byB, byMe}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			onFloor(em, 1, 80)
			me := uuid.New()
			mine := addDelver(em, me, 0, 0, 100)
			pc, _ := mine.GetComponent(ecs.ComponentTypePlayer)
			hc, _ := mine.GetComponent(ecs.ComponentTypeHealth)
			tt.resolve(pc.(*components.PlayerComponent), hc.(*components.HealthComponent))
			addDelver(em, uuid.New(), 2500, 0, tt.hpA)
			addDelver(em, uuid.New(), 5000, 3000, tt.hpB)

			monsterAt := map[uuid.UUID]at{}
			for _, p := range []at{byA, byB, byMe} {
				monsterAt[addMonster(em, "Troll", p.x, p.y, 207, 207).ID] = p
			}

			s := NewStateSerializer(em, nil)
			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
			require.NoError(t, err)
			state := s.FormatStateToClientState(backendState, me)

			got := make([]at, 0)
			for _, id := range monsterIDs(state) {
				got = append(got, monsterAt[id])
			}
			assert.ElementsMatch(t, tt.wantNear, got)
		})
	}
}

// A floor with no cell grid (floors 2–3 today) is never cut, and nor are the
// hub and a field: every entity goes to every recipient as before. FS-KE075
// §G R39, ADR-0060 Decision 4.
func TestFormatStateToClientState_NoCellGrid_NothingIsCut(t *testing.T) {
	tests := []struct {
		name  string
		world types.WorldType
		floor bool
	}{
		{"a run's floor 2", types.WorldTypeRun, true},
		{"the hub", types.WorldTypeHub, false},
		{"a field", types.WorldTypeField, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			if tt.floor {
				onFloor(em, 2, 0)
			}
			me := uuid.New()
			addDelver(em, me, 0, 0, 100)
			far := addMonster(em, "Troll", 5000, 3000, 207, 207)
			chest := addContainer(em, components.ContainerKindChest, 5000, 3000, false)

			s := NewStateSerializer(em, nil)
			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), tt.world, em.GetAllEntities())
			require.NoError(t, err)
			state := s.FormatStateToClientState(backendState, me)

			assert.Equal(t, []uuid.UUID{far.ID}, monsterIDs(state))
			assert.Equal(t, []uuid.UUID{chest.ID}, containerIDs(state))
		})
	}
}
