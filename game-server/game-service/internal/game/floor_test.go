package game

import (
	"context"
	"sync/atomic"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// countingItemsClient is an items service that counts every call made to it.
// It hands out a catalogue and, to each delver, a loadout with one weapon.
type countingItemsClient struct {
	calls atomic.Int32
}

func (c *countingItemsClient) ListItemTemplates(_ context.Context) (*pb.ListItemTemplatesResponse, error) {
	c.calls.Add(1)
	return lootTemplates(true), nil
}

func (c *countingItemsClient) ListItemRarities(_ context.Context) (*pb.ListItemRaritiesResponse, error) {
	c.calls.Add(1)
	return pbRarities(), nil
}

func (c *countingItemsClient) CreateWeapon(_ context.Context, _ *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	c.calls.Add(1)
	return nil, nil
}

func (c *countingItemsClient) GetWeaponWithTemplateByID(_ context.Context, _ *pb.GetWeaponRequest) (*pb.WeaponDetail, error) {
	c.calls.Add(1)
	return nil, nil
}

func (c *countingItemsClient) ListWeaponsWithTemplate(_ context.Context) (*pb.ListWeaponsResponse, error) {
	c.calls.Add(1)
	return nil, nil
}

func (c *countingItemsClient) ListArmorsWithTemplate(_ context.Context) (*pb.ListArmorsResponse, error) {
	c.calls.Add(1)
	return nil, nil
}

func (c *countingItemsClient) ListConsumablesWithTemplate(_ context.Context) (*pb.ListConsumablesResponse, error) {
	c.calls.Add(1)
	return nil, nil
}

func (c *countingItemsClient) GetLoadout(_ context.Context, _ *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	c.calls.Add(1)
	return nil, nil
}

func (c *countingItemsClient) GetLoadoutWithItems(_ context.Context, _ *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	c.calls.Add(1)
	return &pb.GetLoadoutWithItemsResponse{
		Weapon: &pb.ItemInstance{
			Id:          uuid.NewString(),
			TemplateId:  uuid.NewString(),
			ItemType:    "weapon",
			Name:        "Barrow Seax",
			AttackPower: 7,
		},
	}, nil
}

func (c *countingItemsClient) ListItemInstances(_ context.Context, _ *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	c.calls.Add(1)
	return nil, nil
}

// newRun builds a run the way the server does, without starting its loops, so
// the test is the only thing touching the world.
func newRun(t *testing.T, client *countingItemsClient) *Session {
	t.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, client, RunBounds())
	s.InitialMapObjects()
	s.InitialSystems()

	return s
}

// entityIDsWith lists every entity in the world carrying a component.
func entityIDsWith(s *Session, componentType ecs.ComponentType) []uuid.UUID {
	ids := []uuid.UUID{}
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(componentType) {
			ids = append(ids, e.ID)
		}
	}
	return ids
}

func currentFloor(t *testing.T, s *Session) *components.FloorComponent {
	t.Helper()
	floor, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities())
	require.True(t, ok, "a run always knows its floor")
	return floor
}

// FS-F6F88 §Requirements 1, 2, 5, 8.
func TestNewRun_StartsOnTheFirstOfThreeFloors(t *testing.T) {
	s := newRun(t, &countingItemsClient{})

	floor := currentFloor(t, s)
	assert.Equal(t, 1, floor.Depth)
	assert.Equal(t, constants.RunFloorCount, floor.Count)
	assert.Equal(t, 3, constants.RunFloorCount)

	// the layout today's map generator makes
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeEscapeDoor), 1)
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeSwitch), 1)
	assert.NotEmpty(t, entityIDsWith(s, ecs.ComponentTypeDoor), "at least one building places on an empty map")
	assert.LessOrEqual(t, len(entityIDsWith(s, ecs.ComponentTypeDoor)), 3)
}

// party is a run with two delvers on it: one carrying a weapon from their
// loadout and an item picked out of the chest, and one who has fallen. The chest
// is opened with items left in it, an item lies on the ground and a projectile is
// in flight.
type party struct {
	s                *Session
	carrier, fallen  uuid.UUID // player ids
	carriedItemIDs   []uuid.UUID
	pickedUpItemID   uuid.UUID
	chestItemIDs     []uuid.UUID
	groundItemID     uuid.UUID
	projectileID     uuid.UUID
	runLevelEntityID uuid.UUID
}

func delverEntity(t *testing.T, s *Session, playerID uuid.UUID) *ecs.Entity {
	t.Helper()
	entityID, ok := s.playerIDToEntitiesID[playerID]
	require.True(t, ok, "player is not in this world")
	entity, ok := s.EntityManager.GetEntity(entityID)
	require.True(t, ok, "delver entity is gone")
	return entity
}

func newParty(t *testing.T, client *countingItemsClient) *party {
	t.Helper()
	s := newRun(t, client)
	p := &party{s: s, carrier: uuid.New(), fallen: uuid.New()}

	s.AddPlayer(p.carrier, types.CharacterInPlay{Name: "Wren", Class: "warrior"})
	s.AddPlayer(p.fallen, types.CharacterInPlay{Name: "Kaelen", Class: "mage"})

	carrier := delverEntity(t, s, p.carrier)

	// every delver arrives wielding their loadout weapon, the fallen one too
	for _, playerID := range []uuid.UUID{p.carrier, p.fallen} {
		eq, _ := delverEntity(t, s, playerID).GetComponent(ecs.ComponentTypeEquipment)
		weaponID := eq.(*components.EquipmentComponent).WeaponSlot
		require.NotNil(t, weaponID, "the loadout put a weapon in the delver's hand")
		p.carriedItemIDs = append(p.carriedItemIDs, *weaponID)
	}

	// open the chest and take one item out of it, leaving the rest
	containers := entityIDsWith(s, ecs.ComponentTypeContainer)
	require.Len(t, containers, 1, "the chest is placed first on an empty map")
	chest, _ := s.EntityManager.GetEntity(containers[0])
	loot, err := s.generateItems()
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(loot), 2)
	p.pickedUpItemID, p.chestItemIDs = loot[0], loot[1:]
	chestList, _ := chest.GetComponent(ecs.ComponentTypeItemIDList)
	chestList.(*components.ItemIDListComponent).ItemIDs = p.chestItemIDs
	satchel, _ := carrier.GetComponent(ecs.ComponentTypeItemIDList)
	satchel.(*components.ItemIDListComponent).ItemIDs = []uuid.UUID{p.pickedUpItemID}
	p.carriedItemIDs = append(p.carriedItemIDs, p.pickedUpItemID)

	p.groundItemID = s.AddItem(*lootTemplateConfig())

	projectile := s.EntityManager.CreateEntity()
	projectile.AddComponent(components.NewProjectileComponent(components.AttackSnapshot{AttackerEntityID: carrier.ID}, 300, 400, 8, "fireball"))
	projectile.AddComponent(components.NewTransformComponent(200, 200))
	projectile.AddComponent(components.NewVelocityComponent(1, 0, 300))
	p.projectileID = projectile.ID

	// the fallen delver
	fallen := delverEntity(t, s, p.fallen)
	hc, _ := fallen.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	hc.(*components.HealthComponent).IsEliminated = true
	s.eliminations[p.fallen] = 0

	runLevel := entityIDsWith(s, ecs.ComponentTypeMatchProgress)
	require.Len(t, runLevel, 1)
	p.runLevelEntityID = runLevel[0]

	return p
}

func lootTemplateConfig() *types.ItemConfig {
	return &types.ItemConfig{TemplateID: uuid.New(), ItemType: "consumable", Name: "Lesser Heal Potion", HealingAmount: 10}
}

// persistentIDs is everything a floor change must keep: every delver, every item
// a delver wears or carries, and the run-level entity. FS-F6F88 §Requirements 10–12.
func (p *party) persistentIDs(t *testing.T) map[uuid.UUID]bool {
	t.Helper()
	keep := map[uuid.UUID]bool{p.runLevelEntityID: true}
	for _, playerID := range []uuid.UUID{p.carrier, p.fallen} {
		keep[delverEntity(t, p.s, playerID).ID] = true
	}
	for _, id := range p.carriedItemIDs {
		keep[id] = true
	}
	return keep
}

// floorIDs is every entity in the world that belongs to the current floor.
func (p *party) floorIDs(t *testing.T) map[uuid.UUID]bool {
	t.Helper()
	keep := p.persistentIDs(t)
	floor := map[uuid.UUID]bool{}
	for _, e := range p.s.EntityManager.GetAllEntities() {
		if !keep[e.ID] {
			floor[e.ID] = true
		}
	}
	return floor
}

// assertOnlyNewFloorAndPersistent is the leak check: the world holds the new
// floor's layout, the delvers, what they carry and the run-level entity, and
// nothing that belonged to the floor before.
func assertOnlyNewFloorAndPersistent(t *testing.T, p *party, previousFloor map[uuid.UUID]bool) {
	t.Helper()
	s := p.s
	keep := p.persistentIDs(t)

	for id := range keep {
		_, exists := s.EntityManager.GetEntity(id)
		assert.True(t, exists, "a persistent entity %s was cleared", id)
	}
	for id := range previousFloor {
		_, exists := s.EntityManager.GetEntity(id)
		assert.False(t, exists, "entity %s from the previous floor survived", id)
	}
	for _, id := range append([]uuid.UUID{p.groundItemID, p.projectileID}, p.chestItemIDs...) {
		_, exists := s.EntityManager.GetEntity(id)
		assert.False(t, exists, "ground item, chest content or projectile %s survived", id)
	}

	// counted by kind
	doors := len(entityIDsWith(s, ecs.ComponentTypeDoor))
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypePlayer), 2, "delvers")
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeItem), len(p.carriedItemIDs), "only carried items")
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeMatchProgress), 1, "run-level entity")
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeEscapeDoor), 1, "escape door")
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeSwitch), 1, "switch")
	assert.LessOrEqual(t, len(entityIDsWith(s, ecs.ComponentTypeContainer)), 1, "chest")
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeProjectile), "projectiles")
	assert.GreaterOrEqual(t, doors, 1, "buildings place on the new floor")
	assert.LessOrEqual(t, doors, 3)
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeWall), 5*doors, "five walls per building")

	// the new floor is populated afresh; every monster is a floor entity
	monsters := len(entityIDsWith(s, ecs.ComponentTypeEnemy))
	assert.NotZero(t, monsters, "the new floor has its own monsters")
	assert.LessOrEqual(t, monsters, MonsterCountMax+1, "the standard count, plus at most one demon")

	// the way up, below the top floor only
	stairs := len(entityIDsWith(s, ecs.ComponentTypeStairs))
	wantStairs := 0
	if currentFloor(t, s).Depth < constants.RunFloorCount {
		wantStairs = 1
	}
	assert.Equal(t, wantStairs, stairs, "stairs")

	total := len(s.EntityManager.GetAllEntities())
	floorKinds := doors*6 + 2 + len(entityIDsWith(s, ecs.ComponentTypeContainer)) + monsters + stairs
	assert.Equal(t, len(keep)+floorKinds, total, "nothing else is in the world")
}

// A floor change clears the floor and nothing else, and does it again on the
// next climb. FS-F6F88 §Requirements 9–12; AC "Regeneration is leak-free".
func TestRegenerateFloor_KeepsOnlyTheNewFloorAndWhatThePartyCarries(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s

	for wantDepth := 2; wantDepth <= 3; wantDepth++ {
		previousFloor := p.floorIDs(t)

		require.NoError(t, s.regenerateFloor())

		assert.Equal(t, wantDepth, currentFloor(t, s).Depth)
		assertOnlyNewFloorAndPersistent(t, p, previousFloor)
	}
}

// Whatever the session remembers about a floor starts fresh on the next one. A
// stale occupied-area list is the dangerous one: it stops the new floor's
// buildings placing. FS-F6F88 §Requirements 13.
func TestRegenerateFloor_ResetsPerFloorBookkeeping(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	oldExitDoor, oldSwitches := s.exitDoorEntityID, s.switchEntityIDs

	// the old floor's areas cover the whole map: left in place, nothing could place
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, PlaceArea{X: 0, Y: 0, W: constants.MapWidth, H: constants.MapHeight})
	s.containerInteractedCache[oldExitDoor] = true
	s.playerInteractedCache[delverEntity(t, s, p.carrier).ID] = true

	require.NoError(t, s.regenerateFloor())

	doors := entityIDsWith(s, ecs.ComponentTypeDoor)
	containers := entityIDsWith(s, ecs.ComponentTypeContainer)
	assert.NotEmpty(t, doors, "the new floor's buildings place")
	stairs := entityIDsWith(s, ecs.ComponentTypeStairs)
	assert.Len(t, s.objectOccupiedPlaceAreas, len(doors)+len(containers)+2+len(stairs),
		"the occupied areas are the new floor's buildings, chest, escape door, switch and stairs, and nothing else")

	assert.NotEqual(t, oldExitDoor, s.exitDoorEntityID)
	assert.Equal(t, entityIDsWith(s, ecs.ComponentTypeEscapeDoor), []uuid.UUID{s.exitDoorEntityID},
		"the escape door id points at the new floor's door")
	assert.NotEqual(t, oldSwitches, s.switchEntityIDs)
	assert.Equal(t, entityIDsWith(s, ecs.ComponentTypeSwitch), s.switchEntityIDs,
		"the switch ids point at the new floor's switch")

	assert.Empty(t, s.containerInteractedCache, "interaction caches start fresh")
	assert.Empty(t, s.playerInteractedCache, "interaction caches start fresh")
}

// Living delvers are set down on the new floor, standing still and with no
// attack aimed at the old floor. The dead stay behind, out of every later
// broadcast, and the escaped are untouched. Records and accounting persist.
// FS-F6F88 §Requirements 11, 13, 15.
func TestRegenerateFloor_MovesTheLivingAndLeavesTheDeadBehind(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	s.stateSerializer = serializer.NewStateSerializer(s.EntityManager)

	escaped := uuid.New()
	s.AddPlayer(escaped, types.CharacterInPlay{Name: "Isolde", Class: "archer"})
	escapedPlayer, _ := delverEntity(t, s, escaped).GetComponent(ecs.ComponentTypePlayer)
	escapedPlayer.(*components.PlayerComponent).Escape = true
	escapedAt := *transformOf(t, delverEntity(t, s, escaped))

	carrier := delverEntity(t, s, p.carrier)
	vc, _ := carrier.GetComponent(ecs.ComponentTypeVelocity)
	velocity := vc.(*components.VelocityComponent)
	velocity.VX, velocity.VY = 1, -1
	require.NoError(t, s.handleAttack(p.carrier, p.projectileID))
	require.NoError(t, s.handleCastSkill(p.carrier, "slash", 10, 10))

	statsBefore := map[uuid.UUID]components.StatsComponent{}
	for _, id := range []uuid.UUID{p.carrier, p.fallen, escaped} {
		sc, _ := delverEntity(t, s, id).GetComponent(ecs.ComponentTypeStats)
		statsBefore[id] = *sc.(*components.StatsComponent)
	}
	eliminationsBefore := map[uuid.UUID]int{p.fallen: 0}

	require.NoError(t, s.regenerateFloor())

	// the living
	at := transformOf(t, carrier)
	assert.True(t, at.X >= constants.PlayerRadius && at.X <= constants.MapWidth-constants.PlayerRadius, "x in bounds")
	assert.True(t, at.Y >= constants.PlayerRadius && at.Y <= constants.MapHeight-constants.PlayerRadius, "y in bounds")
	assert.Zero(t, velocity.VX)
	assert.Zero(t, velocity.VY)
	ic, _ := carrier.GetComponent(ecs.ComponentTypeAttackIntent)
	assert.Empty(t, ic.(*components.AttackIntentComponent).Pending, "no attack outlives the floor it was aimed at")

	// the escaped are not placed on the new floor
	assert.Equal(t, escapedAt, *transformOf(t, delverEntity(t, s, escaped)))

	// records persist
	assert.Equal(t, eliminationsBefore, s.eliminations)
	for id, before := range statsBefore {
		sc, _ := delverEntity(t, s, id).GetComponent(ecs.ComponentTypeStats)
		assert.Equal(t, before, *sc.(*components.StatsComponent), "stats unchanged")
	}

	// what the next broadcast shows
	state, err := s.stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	assert.Contains(t, state.Players, p.carrier)
	assert.NotContains(t, state.Players, p.fallen, "the dead are not a body on the new floor")
	assert.NotContains(t, state.Players, escaped)
	assert.Equal(t, 1, state.EscapedCount, "escaped count unchanged")
	assert.Equal(t, 2, state.Floor)
	assert.Equal(t, constants.RunFloorCount, state.FloorCount)
}

func transformOf(t *testing.T, e *ecs.Entity) *components.TransformComponent {
	t.Helper()
	tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
	require.True(t, ok)
	return tc.(*components.TransformComponent)
}

// A delver standing where an old-floor wall stood walks straight through the
// space: collision resolves only against the new floor. FS-F6F88 AC "Movement
// collision on the new floor".
func TestRegenerateFloor_OldWallsNoLongerBlock(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s

	// fence the old floor with thin full-height walls every 100px, so wherever
	// the delver ends up, an old wall stands a step in front of them
	const spacing, thickness = 100.0, 10.0
	for x := spacing; x < constants.MapWidth; x += spacing {
		CreateWallEntity(s.EntityManager, WallConfig{X: x, Y: 0, Width: thickness, Height: constants.MapHeight}, uuid.New())
	}

	oldFloor := p.floorIDs(t)
	require.NoError(t, s.regenerateFloor())

	// keep the fallen body out of the way of the spatial hash
	*transformOf(t, delverEntity(t, s, p.fallen)) = components.TransformComponent{X: 5, Y: 5}

	// find a spot just short of where an old fence wall stood, clear of the new floor's walls and doors
	x, y, found := 0.0, 0.0, false
	for fx := spacing; fx < constants.MapWidth-spacing && !found; fx += spacing {
		for cy := 2 * constants.PlayerRadius; cy < constants.MapHeight-2*constants.PlayerRadius && !found; cy += 2 * constants.PlayerRadius {
			cx := fx - constants.PlayerRadius - 3
			if clearOfNewFloorObstacles(s, oldFloor, cx-60, cy-60, 160, 120) {
				x, y, found = cx, cy, true
			}
		}
	}
	require.True(t, found, "the new floor leaves some open ground")

	carrier := delverEntity(t, s, p.carrier)
	*transformOf(t, carrier) = components.TransformComponent{X: x, Y: y}
	vc, _ := carrier.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 1

	// one delver of two is down; the carrier is still in play, so the co-op rule
	// keeps the run going. Buffered so a wrong end signal cannot hang the test
	s.endSessionCh = make(chan bool, 1)
	tick(s)

	moved := transformOf(t, carrier).X - x
	assert.Greater(t, moved, 5.0, "an old-floor wall still blocked the delver")
}

// clearOfNewFloorObstacles reports whether no new-floor wall, door or monster overlaps a box.
func clearOfNewFloorObstacles(s *Session, oldFloor map[uuid.UUID]bool, x, y, w, h float64) bool {
	for _, e := range s.EntityManager.GetAllEntities() {
		if oldFloor[e.ID] {
			continue
		}
		tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
		if tc == nil {
			continue
		}
		at := tc.(*components.TransformComponent)

		var ox, oy, ow, oh float64
		if wc, ok := e.GetComponent(ecs.ComponentTypeWall); ok {
			ox, oy = at.X, at.Y
			ow, oh = wc.(*components.WallComponent).Width, wc.(*components.WallComponent).Height
		} else if dc, ok := e.GetComponent(ecs.ComponentTypeDoor); ok {
			ox, oy = at.X, at.Y
			ow, oh = dc.(*components.DoorComponent).Width, dc.(*components.DoorComponent).Height
		} else if e.HasComponent(ecs.ComponentTypeEnemy) {
			// the new floor's monsters are bodies in the way too
			r := constants.PlayerRadius
			ox, oy, ow, oh = at.X-r, at.Y-r, 2*r, 2*r
		} else {
			continue
		}
		if x < ox+ow && x+w > ox && y < oy+oh && y+h > oy {
			return false
		}
	}
	return true
}

// The item catalogue and rarities are loaded once per run; a floor change asks
// the items service for nothing. FS-F6F88 §Requirements 14.
func TestRegenerateFloor_MakesNoItemsServiceCall(t *testing.T) {
	client := &countingItemsClient{}
	p := newParty(t, client)
	poolBefore := p.s.itemPool.count()
	callsBefore := client.calls.Load()

	require.NoError(t, p.s.regenerateFloor())
	require.NoError(t, p.s.regenerateFloor())

	assert.Equal(t, callsBefore, client.calls.Load())
	assert.Equal(t, poolBefore, p.s.itemPool.count(), "the loot pool is not loaded twice")
}

// Carried items keep their entity id and stats; FS-F6F88 §Requirements 12.
func TestRegenerateFloor_CarriedItemsKeepIDAndStats(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	before := map[uuid.UUID]components.ItemComponent{}
	for _, id := range p.carriedItemIDs {
		e, ok := p.s.EntityManager.GetEntity(id)
		require.True(t, ok)
		ic, _ := e.GetComponent(ecs.ComponentTypeItem)
		before[id] = *ic.(*components.ItemComponent)
	}

	require.NoError(t, p.s.regenerateFloor())

	for id, want := range before {
		e, ok := p.s.EntityManager.GetEntity(id)
		require.True(t, ok, "carried item %s was lost", id)
		ic, _ := e.GetComponent(ecs.ComponentTypeItem)
		assert.Equal(t, want, *ic.(*components.ItemComponent))
	}
}

// The first state serialized after a floor change shows only the new floor.
// FS-F6F88 §Requirements 16.
func TestRegenerateFloor_NextBroadcastHoldsOnlyTheNewFloor(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	oldFloor := p.floorIDs(t)

	require.NoError(t, s.regenerateFloor())

	state, err := serializer.NewStateSerializer(s.EntityManager).SerializeBackendState(
		context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)

	shown := []uuid.UUID{}
	for _, w := range state.Walls {
		shown = append(shown, w.EntityID)
	}
	for _, d := range state.Doors {
		shown = append(shown, d.EntityID)
	}
	for _, c := range state.Containers {
		shown = append(shown, c.EntityID)
		assert.Empty(t, c.Items, "the new chest is unopened")
	}
	for _, d := range state.EscapeDoor {
		shown = append(shown, d.EntityID)
	}
	for _, sw := range state.Switch {
		shown = append(shown, sw.EntityID)
	}
	for _, pr := range state.Projectiles {
		shown = append(shown, pr.EntityID)
	}

	require.NotEmpty(t, shown)
	for _, id := range shown {
		assert.False(t, oldFloor[id], "entity %s from the previous floor was broadcast", id)
		_, exists := s.EntityManager.GetEntity(id)
		assert.True(t, exists)
	}
	assert.Empty(t, state.Projectiles)
}

// A floor change never ends the run, not even on reaching the top.
// FS-F6F88 §Requirements 24.
func TestRegenerateFloor_NeverSignalsRunEnd(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	p.s.endSessionCh = make(chan bool, 1)

	require.NoError(t, p.s.regenerateFloor())
	require.NoError(t, p.s.regenerateFloor())

	assert.Equal(t, 3, currentFloor(t, p.s).Depth, "on the top floor")
	assert.Empty(t, p.s.endSessionCh)
}

// The top floor has nothing above it. FS-F6F88 §Requirements 1–2.
func TestRegenerateFloor_RefusesAboveTheTop(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	require.NoError(t, p.s.regenerateFloor())
	require.NoError(t, p.s.regenerateFloor())
	before := len(p.s.EntityManager.GetAllEntities())

	err := p.s.regenerateFloor()

	assert.ErrorIs(t, err, ErrTopFloor)
	assert.Equal(t, 3, currentFloor(t, p.s).Depth)
	assert.Equal(t, before, len(p.s.EntityManager.GetAllEntities()), "nothing was cleared")
}

// Items carried up from a lower floor are in the run's end-of-match state.
// World-level: see FS-F6F88 §Edge States on the end-of-run ordering defect.
// FS-F6F88 §Requirements 25.
func TestRegenerateFloor_EndOfMatchStateListsItemsFromEarlierFloors(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	pickedUp, _ := p.s.EntityManager.GetEntity(p.pickedUpItemID)
	ic, _ := pickedUp.GetComponent(ecs.ComponentTypeItem)
	pickedUpName := ic.(*components.ItemComponent).Name

	require.NoError(t, p.s.regenerateFloor())

	raw := p.s.getRawMatchState()

	var carrier *types.RawPlayerState
	for i := range raw.Players {
		if raw.Players[i].MemberID == p.carrier.String() {
			carrier = &raw.Players[i]
		}
	}
	require.NotNil(t, carrier, "the carrier is in the end-of-match state")
	require.Len(t, carrier.Inventory, 1)
	assert.Equal(t, pickedUpName, carrier.Inventory[0].Name)
	require.NotNil(t, carrier.Equipment.WeaponSlot)
	assert.Equal(t, "Barrow Seax", carrier.Equipment.WeaponSlot.Name)
}

// A floor change asked for from anywhere is applied by the loop, between ticks,
// and however many times it was asked for before the loop got to it, it happens
// once. FS-F6F88 §Requirements 16, 21.
func TestRequestFloorChange_AppliedOnceBetweenTicks(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s

	stairs := entityIDsWith(s, ecs.ComponentTypeStairs)
	require.Len(t, stairs, 1)
	s.requestFloorChange(stairs[0])
	s.requestFloorChange(stairs[0])
	assert.Equal(t, 1, currentFloor(t, s).Depth, "a request alone changes nothing mid-tick")

	s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, s).Depth)

	s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, s).Depth, "the request was consumed")
}
