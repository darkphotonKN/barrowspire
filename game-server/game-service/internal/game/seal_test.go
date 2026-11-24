package game

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-5FZ4J §B R12: an interact on the stairs while a seal of the floor holds
// is refused stairs_sealed, and nothing else happens: no climb is asked for.
func TestSealedStairs_RefusesStairsSealed(t *testing.T) {
	c := newSealedClimb(t)
	require.NotEmpty(t, sealsOf(t, c.s), "the floor is sealed")
	for _, d := range c.delvers {
		c.standAtStairs(t, d)
	}

	require.NoError(t, c.interactWithStairs(t, c.delvers[0]))

	reply := c.lastMessage(t, c.delvers[0])
	assert.Equal(t, false, reply.Payload["success"])
	assert.Equal(t, RefusalStairsSealed, reply.Payload["reason"])
	assert.Empty(t, c.s.ascentRequests, "no climb is asked for")
}

// sealsOf is every seal of the floor.
func sealsOf(t *testing.T, s *Session) []*components.SealComponent {
	t.Helper()
	var seals []*components.SealComponent
	for _, e := range s.EntityManager.GetAllEntities() {
		if sc, ok := e.GetComponent(ecs.ComponentTypeSeal); ok {
			seals = append(seals, sc.(*components.SealComponent))
		}
	}
	return seals
}

// buildingDoorIDs is every door of the floor that is a building's: a
// sealed floor's gate is a barrier, not a door of a building.
func buildingDoorIDs(s *Session) []uuid.UUID {
	ids := []uuid.UUID{}
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeDoor) && !e.HasComponent(ecs.ComponentTypeBarrier) {
			ids = append(ids, e.ID)
		}
	}
	return ids
}

// breakSeals breaks every seal of the floor, as its last piece would.
func breakSeals(t *testing.T, s *Session) {
	t.Helper()
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeSeal) {
			s.breakSeal(e)
		}
	}
}

// gateOf is the floor's gate.
func gateOf(t *testing.T, s *Session) *ecs.Entity {
	t.Helper()
	for _, e := range s.EntityManager.GetAllEntities() {
		if bc, ok := e.GetComponent(ecs.ComponentTypeBarrier); ok && bc.(*components.BarrierComponent).Kind == components.BarrierGate {
			return e
		}
	}
	require.Fail(t, "the floor has no gate")
	return nil
}

// gateApproach is where a body stands in the gate corridor one cell short of
// the gate, its middle, and the unit step that walks it through the gate into
// the stairs room.
func gateApproach(s *Session) (x, y, dx, dy float64) {
	d := s.dungeon
	size := d.layout.CellSize
	gate := d.layout.Stairs.Barrier
	room := d.layout.Rooms[d.layout.Stairs.Room].Rect
	midX := (float64(gate.X) + float64(gate.W)/2) * size
	midY := (float64(gate.Y) + float64(gate.H)/2) * size
	if gate.W == 1 { // a column: the corridor runs east-west
		dx = 1
		if room.X < gate.X {
			dx = -1
		}
		return midX - dx*size, midY, dx, 0
	}
	dy = 1
	if room.Y < gate.Y {
		dy = -1
	}
	return midX, midY - dy*size, 0, dy
}

// walkInto stands the delver at the gate's approach and walks them at it for
// two seconds; it reports whether their body reached the stairs room.
func walkInto(t *testing.T, s *Session, delver *ecs.Entity) bool {
	t.Helper()
	x, y, dx, dy := gateApproach(s)
	at := transformOf(t, delver)
	at.X, at.Y = x, y
	vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX, vc.(*components.VelocityComponent).VY = dx, dy
	for range 2 * 30 {
		keepStanding(s.EntityManager)
		tick(s)
	}
	vc.(*components.VelocityComponent).VX, vc.(*components.VelocityComponent).VY = 0, 0
	return s.dungeon.roomAt(at.X, at.Y) == s.dungeon.layout.Stairs.Room
}

// FS-5FZ4J §A R4, §D R22: a shut gate blocks a delver walking at it and is
// rock to a monster's path; once its seal breaks, the delver walks through
// and a monster in the stairs room paths out to them, from that tick.
func TestGate_ShutBlocksBodiesAndPaths_OpenLetsBothThrough(t *testing.T) {
	s, ids := dungeonRun(t, 7, 1, 0)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	delver := delverEntity(t, s, ids[0])

	assert.False(t, walkInto(t, s, delver), "the shut gate blocks the delver")

	centre := s.dungeon.roomCentre(s.dungeon.layout.Stairs.Room)
	monster := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: centre.x, Y: centre.y})
	mc := monsterOf(monster)
	mc.LastAttacker = delver.ID
	tick(s)
	assert.Empty(t, mc.Route.Cells, "no path through the shut gate")

	breakSeals(t, s)
	assert.True(t, barrierOpen(gateOf(t, s)), "the gate opened with its seal")
	mc.LastAttacker, mc.Route.SearchIn = delver.ID, 0
	tick(s)
	assert.NotEmpty(t, mc.Route.Cells, "the monster paths out through the open gate on the tick it opens")

	s.EntityManager.RemoveEntity(monster.ID)
	assert.True(t, walkInto(t, s, delver), "the open gate lets the delver through")
}

// sealedRun is floor 1 of a seeded run with one delver, its sender
// recording, ticked once so the delver's gear has counted.
func sealedRun(t *testing.T, seed uint64) (*Session, uuid.UUID, *recordingSender) {
	t.Helper()
	s, ids := dungeonRun(t, seed, 1, 0)
	sender := &recordingSender{}
	s.sender = sender
	tick(s)
	return s, ids[0], sender
}

// lastReply is the last message the player was sent.
func lastReply(t *testing.T, sender *recordingSender, playerID uuid.UUID) map[string]interface{} {
	t.Helper()
	sent := sender.to(playerID)
	require.NotEmpty(t, sent, "the delver was told something")
	return sent[len(sent)-1].Payload
}

// FS-5FZ4J §B R13: a reach for the shut gate is refused gate_sealed and the
// gate stays shut; it is no door to toggle.
func TestGate_InteractWhileSealed_RefusesGateSealed(t *testing.T) {
	s, player, sender := sealedRun(t, 7)
	at := transformOf(t, delverEntity(t, s, player))
	at.X, at.Y, _, _ = gateApproach(s)
	gate := gateOf(t, s)

	require.NoError(t, s.handleInteract(player, gate.ID))

	reply := lastReply(t, sender, player)
	assert.Equal(t, false, reply["success"])
	assert.Equal(t, RefusalGateSealed, reply["reason"])
	assert.False(t, barrierOpen(gate), "the gate stays shut")
}

// FS-5FZ4J §H R45: a seal piece, a lever or a mural, is kept out of every
// monster's spawn, as every fixture is; so is the gate.
func TestMapKeepOut_CoversSealPiecesAndTheGate(t *testing.T) {
	for _, kind := range []components.SealPieceKind{components.SealPieceLever, components.SealPieceMural} {
		em := ecs.NewEntityManager()
		CreateSealPieceEntity(em, SealPieceConfig{Kind: kind, X: 500, Y: 400})
		covered := false
		for _, area := range mapKeepOut(em.GetAllEntities()) {
			if area.overlapsBody(500, 400, constants.PlayerRadius) {
				covered = true
			}
		}
		assert.True(t, covered, "a monster may not start on a %s", kind)
	}

	em := ecs.NewEntityManager()
	CreateBarrierEntity(em, BarrierConfig{Kind: components.BarrierGate, X: 480, Y: 320, Width: 80, Height: 160})
	covered := false
	for _, area := range mapKeepOut(em.GetAllEntities()) {
		if area.overlapsBody(520, 400, constants.PlayerRadius) {
			covered = true
		}
	}
	assert.True(t, covered, "a monster may not start in the gate")
}

// FS-5FZ4J §A R1, §I R46: a floor of buildings, left by a failed generation,
// has no seal, no gate and no pieces, and its stairs climb; the top floor has
// no stairs and no seal; a sealed floor's state carries all three keys.
func TestSeal_OnlyOnASealedDungeonFloor(t *testing.T) {
	c := newSealedClimb(t)
	s := c.s
	ser := serializer.NewStateSerializer(s.EntityManager, nil)
	frame := func() *types.ClientGameState {
		backend, err := ser.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
		require.NoError(t, err)
		return ser.FormatStateToClientState(backend, uuid.New())
	}

	sealed := frame()
	require.NotNil(t, sealed.Seal, "a sealed floor sends its seal")
	assert.Equal(t, "lever_order", sealed.Seal.Kind)
	assert.Len(t, sealed.SealPieces, LeverCountLow+1, "its levers and mural")
	require.Len(t, sealed.Barriers, 1, "its gate")
	assert.Equal(t, "gate", sealed.Barriers[0].Kind)

	failGeneration(s)
	require.NoError(t, s.regenerateFloor())
	require.Nil(t, s.dungeon, "floor 2 is a floor of buildings")
	assert.Empty(t, sealsOf(t, s), "a floor of buildings has no seal")
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeBarrier))
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeSealPiece))
	buildings := frame()
	assert.Nil(t, buildings.Seal)
	assert.Empty(t, buildings.SealPieces)
	assert.Empty(t, buildings.Barriers)
	for _, d := range c.delvers {
		c.standAtStairs(t, d)
	}
	require.NoError(t, c.interactWithStairs(t, c.delvers[0]))
	s.applyRequestedFloorChange()
	require.Equal(t, testSpireHeight, currentFloor(t, s).Depth, "a floor of buildings' stairs climb")

	top := frame()
	assert.Nil(t, top.Seal, "the top floor has no seal")
	assert.Empty(t, top.Barriers)
	assert.Empty(t, top.SealPieces)
}

// FS-5FZ4J §A R1, R4: a dungeon top floor has no stairs, so no seal and no
// gate; every floor below it is sealed.
func TestSeal_DungeonTopFloorHasNone(t *testing.T) {
	s, _ := dungeonRun(t, 5, 1, 0)
	for depth := firstFloor; depth < testSpireHeight; depth++ {
		require.NotNil(t, s.dungeon)
		assert.Len(t, sealsOf(t, s), 1, "floor %d is sealed", depth)
		assert.Len(t, barriersOfKind(s, components.BarrierGate), 1, "floor %d has its gate", depth)
		require.NoError(t, s.regenerateFloor())
	}
	require.NotNil(t, s.dungeon, "the top floor is a dungeon")
	assert.Empty(t, sealsOf(t, s), "the top floor has no seal")
	assert.Empty(t, barriersOfKind(s, components.BarrierGate), "and no gate")
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeSealPiece))
}

// barriersOfKind is every barrier of kind on the floor.
func barriersOfKind(s *Session, kind components.BarrierKind) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if bc, ok := e.GetComponent(ecs.ComponentTypeBarrier); ok && bc.(*components.BarrierComponent).Kind == kind {
			out = append(out, e)
		}
	}
	return out
}
