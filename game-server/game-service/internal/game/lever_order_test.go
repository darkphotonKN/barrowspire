package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// piecesOfKind is the floor's seal pieces of kind, by entity.
func piecesOfKind(s *Session, kind components.SealPieceKind) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok && pc.(*components.SealPieceComponent).Kind == kind {
			out = append(out, e)
		}
	}
	return out
}

// pieceOf is a seal piece entity's piece.
func pieceOf(e *ecs.Entity) *components.SealPieceComponent {
	pc, _ := e.GetComponent(ecs.ComponentTypeSealPiece)
	return pc.(*components.SealPieceComponent)
}

// leversInTurn is the floor's levers in the order they are pulled.
func leversInTurn(t *testing.T, s *Session) []*ecs.Entity {
	t.Helper()
	levers := piecesOfKind(s, components.SealPieceLever)
	require.NotEmpty(t, levers, "the floor has levers")
	slices.SortFunc(levers, func(a, b *ecs.Entity) int { return pieceOf(a).Turn - pieceOf(b).Turn })
	return levers
}

// pull stands the player beside piece and works it.
func pull(t *testing.T, s *Session, playerID uuid.UUID, piece *ecs.Entity) {
	t.Helper()
	body, at := transformOf(t, delverEntity(t, s, playerID)), transformOf(t, piece)
	body.X, body.Y = at.X, at.Y
	require.NoError(t, s.handleInteract(playerID, piece.ID))
}

// FS-5FZ4J §C R15, §A R5: floor 1's Lever Order has 3 levers, each in a room
// of its own, bearing distinct glyphs from the six, in an order that is a
// permutation of them, and one mural in another room; no piece stands in the
// start room or the stairs room. Checked over many seeds.
func TestLeverOrder_Floor1_ThreeLeversAndAMuralInRoomsOfTheirOwn(t *testing.T) {
	forceSeal(t, components.SealLeverOrder)
	for seed := uint64(1); seed <= 40; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		require.NotNil(t, s.dungeon, "seed %d", seed)
		seals := sealsOf(t, s)
		require.Len(t, seals, 1, "seed %d: one seal", seed)
		assert.Equal(t, components.SealLeverOrder, seals[0].Kind)
		assert.Equal(t, 1, seals[0].Stage)

		levers := leversInTurn(t, s)
		murals := piecesOfKind(s, components.SealPieceMural)
		require.Len(t, levers, LeverCountLow, "seed %d", seed)
		require.Len(t, murals, 1, "seed %d", seed)

		rooms := map[int]bool{}
		var glyphs []string
		for i, e := range append(slices.Clone(levers), murals[0]) {
			at := transformOf(t, e)
			room := s.dungeon.roomAt(at.X, at.Y)
			require.NotEqual(t, -1, room, "seed %d: a piece stands in a room", seed)
			assert.False(t, rooms[room], "seed %d: a room of its own", seed)
			rooms[room] = true
			assert.NotEqual(t, s.dungeon.layout.Roles.Start, room, "seed %d: not the start room", seed)
			assert.NotEqual(t, s.dungeon.layout.Roles.Stairs, room, "seed %d: not the stairs room", seed)
			assert.Equal(t, s.dungeon.cellOf(point{at.X, at.Y}), pieceOf(e).Cell)
			if i < len(levers) {
				assert.Equal(t, i+1, pieceOf(e).Turn, "seed %d: the turns are 1..n", seed)
				assert.Contains(t, LeverGlyphs, pieceOf(e).Glyph)
				glyphs = append(glyphs, pieceOf(e).Glyph)
				assert.True(t, e.HasComponent(ecs.ComponentTypeAmbush), "a lever wakes an ambush")
			}
		}
		slices.Sort(glyphs)
		assert.Len(t, slices.Compact(glyphs), LeverCountLow, "seed %d: no glyph repeats", seed)
		assert.False(t, murals[0].HasComponent(ecs.ComponentTypeAmbush), "the mural wakes nothing")
	}
}

// FS-5FZ4J §C R15: floors 4+ have 3 or 4 levers.
func TestLeverCount_ByFloor(t *testing.T) {
	rng := seededSpawns(1)
	for depth := 1; depth <= LeverLowFloorsMax; depth++ {
		assert.Equal(t, 3, leverCount(rng, depth))
	}
	seen := map[int]bool{}
	for range 200 {
		seen[leverCount(rng, 5)] = true
	}
	assert.Equal(t, map[int]bool{3: true, 4: true}, seen)
}

// FS-5FZ4J §C R16, §B R11-R13: levers pulled in their turn stay down; the
// last breaks the seal, which opens the gate and the stairs, and the party
// climbs.
func TestLeverOrder_InTurnPullsStayDown_TheLastBreaksTheSealAndOpensTheWayUp(t *testing.T) {
	forceSeal(t, components.SealLeverOrder)
	c := newSealedClimb(t)
	levers := leversInTurn(t, c.s)

	for i, lever := range levers {
		pull(t, c.s, c.delvers[0], lever)
		for _, earlier := range levers[:i+1] {
			assert.True(t, pieceOf(earlier).Active, "lever %d stays down", pieceOf(earlier).Turn)
		}
		if i < len(levers)-1 {
			assert.True(t, c.s.sealHolds(), "the seal holds until the last lever")
			assert.False(t, barrierOpen(gateOf(t, c.s)))
		}
	}

	assert.False(t, c.s.sealHolds(), "the last in-turn pull breaks the seal")
	assert.True(t, sealsOf(t, c.s)[0].Broken)
	assert.True(t, barrierOpen(gateOf(t, c.s)), "the gate opens with it")

	for _, d := range c.delvers {
		c.standAtStairs(t, d)
	}
	require.NoError(t, c.interactWithStairs(t, c.delvers[0]))
	c.s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, c.s).Depth, "the stairs climb")
}

// FS-5FZ4J §C R16, §I R49: a lever already down refuses quietly, lever_down,
// and nothing changes.
func TestLeverOrder_LeverAlreadyDown_RefusesLeverDown(t *testing.T) {
	forceSeal(t, components.SealLeverOrder)
	s, player, sender := sealedRun(t, 7)
	first := leversInTurn(t, s)[0]
	pull(t, s, player, first)
	health := currentHealth(delverEntity(t, s, player))

	pull(t, s, player, first)
	tick(s)

	reply := lastReply(t, sender, player)
	assert.Equal(t, false, reply["success"])
	assert.Equal(t, RefusalLeverDown, reply["reason"])
	assert.True(t, pieceOf(first).Active, "it stays down")
	assert.Equal(t, health, currentHealth(delverEntity(t, s, player)), "no dart")
}

// FS-5FZ4J §C R15, §I R49: the mural answers mural with the levers' glyphs
// in the order they are pulled, and wakes nothing.
func TestLeverOrder_Mural_AnswersTheGlyphsInOrder(t *testing.T) {
	forceSeal(t, components.SealLeverOrder)
	s, player, sender := sealedRun(t, 7)
	var want []interface{}
	for _, lever := range leversInTurn(t, s) {
		want = append(want, pieceOf(lever).Glyph)
	}
	monsters := len(monstersInWorld(s.EntityManager))

	pull(t, s, player, piecesOfKind(s, components.SealPieceMural)[0])

	reply := lastReply(t, sender, player)
	assert.Equal(t, true, reply["success"])
	assert.Equal(t, ReasonMural, reply["reason"])
	assert.Equal(t, want, toAnys(reply["glyphs"]))
	assert.Len(t, monstersInWorld(s.EntityManager), monsters, "the mural wakes nothing")
}

// toAnys is a reply's list as []interface{}, whatever slice it was sent as.
func toAnys(v interface{}) []interface{} {
	switch list := v.(type) {
	case []string:
		out := make([]interface{}, len(list))
		for i, s := range list {
			out[i] = s
		}
		return out
	case []interface{}:
		return list
	}
	return nil
}

// FS-5FZ4J §C R16, §D R26: a lever pulled out of turn fires a dart volley at
// the puller, a hit through the combat that lands on the tick, and springs
// every lever of the seal back up; the reply is lever_wrong. The order starts
// again: the first lever pulled in turn then stays down.
func TestLeverOrder_OutOfTurn_DartHitsThePullerAndEveryLeverResets(t *testing.T) {
	forceSeal(t, components.SealLeverOrder)
	s, player, sender := sealedRun(t, 7)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	levers := leversInTurn(t, s)
	delver := delverEntity(t, s, player)
	pull(t, s, player, levers[0])
	require.True(t, pieceOf(levers[0]).Active)
	health := currentHealth(delver)

	pull(t, s, player, levers[2])

	reply := lastReply(t, sender, player)
	assert.Equal(t, false, reply["success"])
	assert.Equal(t, RefusalLeverWrong, reply["reason"])
	for _, lever := range levers {
		assert.False(t, pieceOf(lever).Active, "lever %d sprang back up", pieceOf(lever).Turn)
	}
	tick(s)
	assert.Less(t, currentHealth(delver), health, "the dart volley hit the puller")
	assert.True(t, s.sealHolds())

	pull(t, s, player, levers[0])
	assert.True(t, pieceOf(levers[0]).Active, "the order starts again")
}

// FS-5FZ4J §D R26: a trap's hit is a standard fodder monster's base hit at
// the floor's monster level times its kind's factor, mitigated as a monster's
// hit is (no true damage), and credits no monster.
func TestTrapHit_IsTheFloorsFodderHitTimesItsFactor(t *testing.T) {
	for _, level := range []int{1, 7, 20} {
		hit := trapHit(uuid.New(), level, TrapFactorDartWall)
		want := float64(monsterSheets[standardFodder].statsAt(level).Damage) * TrapFactorDartWall
		assert.InDelta(t, want, hit.Power, 1e-9, "level %d", level)
		assert.Equal(t, 1.0, hit.Coefficient)
		assert.Zero(t, hit.TrueDamage, "armour applies")
		assert.Equal(t, components.DamagePhysical, hit.DamageType)
		assert.Equal(t, uuid.Nil, hit.AttackerMemberID)
		assert.False(t, hit.FromMonster)
		assert.Zero(t, hit.CritChance)
	}
}
