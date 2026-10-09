package game

import (
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stairsFootprint is the area the stairs take up, centred on their position.
func stairsFootprint(t *testing.T, stairs *ecs.Entity) PlaceArea {
	t.Helper()
	tc, ok := stairs.GetComponent(ecs.ComponentTypeTransform)
	require.True(t, ok, "stairs stand somewhere")
	at := tc.(*components.TransformComponent)
	return PlaceArea{
		X: at.X - constants.StairsWidthRadius,
		Y: at.Y - constants.StairsHeightRadius,
		W: 2 * constants.StairsWidthRadius,
		H: 2 * constants.StairsHeightRadius,
	}
}

func overlaps(a, b PlaceArea) bool {
	return a.X < b.X+b.W && a.X+a.W > b.X && a.Y < b.Y+b.H && a.Y+a.H > b.Y
}

// assertStairsClearOfTheFloor checks the stairs overlap no building, chest,
// escape door or switch.
func assertStairsClearOfTheFloor(t *testing.T, s *Session) {
	t.Helper()
	var others []*ecs.Entity
	var stairs []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeStairs) {
			stairs = append(stairs, e)
			continue
		}
		others = append(others, e)
	}
	require.Len(t, stairs, 1)
	footprint := stairsFootprint(t, stairs[0])
	for _, area := range mapKeepOut(others) {
		assert.False(t, overlaps(footprint, area), "stairs %+v overlap %+v", footprint, area)
	}
}

// Floors 1 and 2 have one stairs entity each, clear of everything else on the
// floor; the top floor has none. FS-F6F88 §Requirements 6, 7.
func TestBuildFloor_StairsOnEveryFloorButTheTop(t *testing.T) {
	for run := 0; run < 30; run++ {
		p := newParty(t, &countingItemsClient{})
		s := p.s

		require.Len(t, entityIDsWith(s, ecs.ComponentTypeStairs), 1, "floor 1 has stairs")
		assertStairsClearOfTheFloor(t, s)

		require.NoError(t, s.regenerateFloor())
		require.Len(t, entityIDsWith(s, ecs.ComponentTypeStairs), 1, "floor 2 has stairs")
		assertStairsClearOfTheFloor(t, s)

		require.NoError(t, s.regenerateFloor())
		assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeStairs), "the top floor has none")
	}
}

// A non-top floor never lacks stairs: when random placement runs out they go to
// a free spot found by scanning the floor, and onto a full floor regardless.
// FS-F6F88 §Requirements 7; §Edge States "Placement exhausted".
func TestCreateStairs_PlacementExhausted_StillPlaces(t *testing.T) {
	// a 120x120 hole in the bottom-right corner, everything else taken
	const holeW, holeH = 120.0, 120.0
	hole := PlaceArea{X: constants.MapWidth - holeW, Y: constants.MapHeight - holeH, W: holeW, H: holeH}

	tests := []struct {
		name     string
		occupied []PlaceArea
		inHole   bool
	}{
		{
			name: "only a corner of the floor is free",
			occupied: []PlaceArea{
				{X: 0, Y: 0, W: constants.MapWidth, H: constants.MapHeight - holeH},
				{X: 0, Y: constants.MapHeight - holeH, W: constants.MapWidth - holeW, H: holeH},
			},
			inHole: true,
		},
		{
			name:     "the whole floor is taken",
			occupied: []PlaceArea{{X: 0, Y: 0, W: constants.MapWidth, H: constants.MapHeight}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newRun(t, &countingItemsClient{})
			for _, id := range entityIDsWith(s, ecs.ComponentTypeStairs) {
				s.EntityManager.RemoveEntity(id)
			}
			s.objectOccupiedPlaceAreas = tt.occupied

			s.CreateStairs()

			ids := entityIDsWith(s, ecs.ComponentTypeStairs)
			require.Len(t, ids, 1, "the floor has its stairs")
			stairs, _ := s.EntityManager.GetEntity(ids[0])
			footprint := stairsFootprint(t, stairs)
			assert.GreaterOrEqual(t, footprint.X, 0.0)
			assert.GreaterOrEqual(t, footprint.Y, 0.0)
			assert.LessOrEqual(t, footprint.X+footprint.W, constants.MapWidth)
			assert.LessOrEqual(t, footprint.Y+footprint.H, constants.MapHeight)
			if tt.inHole {
				for _, area := range tt.occupied {
					assert.False(t, overlaps(footprint, area), "stairs placed on an occupied area")
				}
				assert.True(t, overlaps(footprint, hole))
			}
		})
	}
}

// recordingSender keeps every message sent to a single player.
type recordingSender struct {
	mu   sync.Mutex
	sent map[uuid.UUID][]types.Message
}

func (r *recordingSender) SendMessageToPlayer(playerID uuid.UUID, message types.Message) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.sent == nil {
		r.sent = map[uuid.UUID][]types.Message{}
	}
	r.sent[playerID] = append(r.sent[playerID], message)
	return nil
}

func (r *recordingSender) BroadcastToPlayerList(_ []uuid.UUID, _ types.Message) error { return nil }
func (r *recordingSender) SendStateToPlayer(_ uuid.UUID, _ *types.ClientGameState) error {
	return nil
}
func (r *recordingSender) BroadcastStateToPlayerList(_ []uuid.UUID, _ *types.ClientGameState) error {
	return nil
}

func (r *recordingSender) to(playerID uuid.UUID) []types.Message {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]types.Message(nil), r.sent[playerID]...)
}

// climb is a run with three living delvers, nobody yet near the stairs.
type climb struct {
	s       *Session
	sender  *recordingSender
	delvers []uuid.UUID // player ids
}

func newClimb(t *testing.T) *climb {
	t.Helper()
	s := newRun(t, &countingItemsClient{})
	sender := &recordingSender{}
	s.sender = sender
	c := &climb{s: s, sender: sender}
	for _, name := range []string{"Wren", "Kaelen", "Odo"} {
		playerID := uuid.New()
		s.AddPlayer(playerID, types.CharacterInPlay{Name: name, Class: "warrior"})
		c.delvers = append(c.delvers, playerID)
		c.standFarAway(t, playerID)
	}
	return c
}

func (c *climb) stairs(t *testing.T) *ecs.Entity {
	t.Helper()
	ids := entityIDsWith(c.s, ecs.ComponentTypeStairs)
	require.Len(t, ids, 1, "this floor has stairs")
	stairs, _ := c.s.EntityManager.GetEntity(ids[0])
	return stairs
}

func (c *climb) moveTo(t *testing.T, playerID uuid.UUID, x, y float64) {
	t.Helper()
	tc, _ := delverEntity(t, c.s, playerID).GetComponent(ecs.ComponentTypeTransform)
	transform := tc.(*components.TransformComponent)
	transform.X, transform.Y = x, y
}

// standAtStairs puts a delver well inside the stairs' interact range.
func (c *climb) standAtStairs(t *testing.T, playerID uuid.UUID) {
	t.Helper()
	tc, _ := c.stairs(t).GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	c.moveTo(t, playerID, at.X+constants.DefaultInteractableRange/2, at.Y)
}

// standFarAway puts a delver on the far side of the floor from the stairs.
func (c *climb) standFarAway(t *testing.T, playerID uuid.UUID) {
	t.Helper()
	tc, _ := c.stairs(t).GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	x, y := constants.PlayerRadius, constants.PlayerRadius
	if at.X < constants.MapWidth/2 {
		x = constants.MapWidth - constants.PlayerRadius
	}
	if at.Y < constants.MapHeight/2 {
		y = constants.MapHeight - constants.PlayerRadius
	}
	c.moveTo(t, playerID, x, y)
}

func (c *climb) interactWithStairs(t *testing.T, playerID uuid.UUID) error {
	t.Helper()
	return c.s.handleInteract(playerID, c.stairs(t).ID)
}

func (c *climb) lastMessage(t *testing.T, playerID uuid.UUID) types.Message {
	t.Helper()
	sent := c.sender.to(playerID)
	require.NotEmpty(t, sent, "the delver was told something")
	return sent[len(sent)-1]
}

// The party climbs together: with one delver still away the stairs refuse and
// say how many are missing; once everyone has gathered, the party goes up.
// FS-F6F88 §Requirements 18, 21, 22.
func TestStairs_ClimbsOnlyOnceThePartyHasGathered(t *testing.T) {
	c := newClimb(t)
	wren, kaelen, odo := c.delvers[0], c.delvers[1], c.delvers[2]
	c.standAtStairs(t, wren)
	c.standAtStairs(t, kaelen)
	stairsBefore := c.stairs(t).ID

	err := c.interactWithStairs(t, wren)

	assert.ErrorIs(t, err, ErrPartyNotGathered)
	assert.Equal(t, types.Message{
		Action: string(constants.ActionInteract),
		Payload: map[string]interface{}{
			"success": false,
			"message": "the party has not gathered at the stairs",
			"reason":  "party_not_gathered",
			"missing": 1,
		},
	}, c.lastMessage(t, wren))
	c.s.applyRequestedFloorChange()
	assert.Equal(t, 1, currentFloor(t, c.s).Depth, "nothing changes")
	assert.Equal(t, stairsBefore, c.stairs(t).ID, "nothing changes")

	c.standAtStairs(t, odo)
	require.NoError(t, c.interactWithStairs(t, wren))
	assert.Equal(t, 1, currentFloor(t, c.s).Depth, "the climb waits for the loop")

	c.s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, c.s).Depth)
	_, oldStairsStand := c.s.EntityManager.GetEntity(stairsBefore)
	assert.False(t, oldStairsStand, "a fresh floor")
}

// An interacting delver who is out of range gets the existing refusal, whoever
// else is gathered. FS-F6F88 §Requirements 17.
func TestStairs_InteractorOutOfRange_IsTooFarAway(t *testing.T) {
	c := newClimb(t)
	wren := c.delvers[0]

	err := c.interactWithStairs(t, wren)

	assert.ErrorIs(t, err, ErrOutOfRange)
	assert.Equal(t, "too far away to interact", c.lastMessage(t, wren).Payload["message"])
	c.s.applyRequestedFloorChange()
	assert.Equal(t, 1, currentFloor(t, c.s).Depth)
}

// Dead and escaped delvers never hold the party back; a lone survivor climbs
// alone. FS-F6F88 §Requirements 19; §Edge States "A delver dies at the stairs".
func TestStairs_DeadAndEscapedDelversNeverBlock(t *testing.T) {
	die := func(t *testing.T, c *climb, playerID uuid.UUID) {
		hc, _ := delverEntity(t, c.s, playerID).GetComponent(ecs.ComponentTypeHealth)
		hc.(*components.HealthComponent).CurrentHealth = 0
		hc.(*components.HealthComponent).IsEliminated = true
	}
	escape := func(t *testing.T, c *climb, playerID uuid.UUID) {
		pc, _ := delverEntity(t, c.s, playerID).GetComponent(ecs.ComponentTypePlayer)
		pc.(*components.PlayerComponent).Escape = true
	}

	tests := []struct {
		name    string
		absent  []func(*testing.T, *climb, uuid.UUID)
		climber int
	}{
		{"one away has fallen", []func(*testing.T, *climb, uuid.UUID){die}, 2},
		{"one away has escaped", []func(*testing.T, *climb, uuid.UUID){escape}, 2},
		{"the lone survivor", []func(*testing.T, *climb, uuid.UUID){die, escape}, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newClimb(t)
			// the absent are the last delvers, far from the stairs
			for i, leave := range tt.absent {
				leave(t, c, c.delvers[len(c.delvers)-1-i])
			}
			for _, playerID := range c.delvers[:tt.climber] {
				c.standAtStairs(t, playerID)
			}

			require.NoError(t, c.interactWithStairs(t, c.delvers[0]))
			c.s.applyRequestedFloorChange()

			assert.Equal(t, 2, currentFloor(t, c.s).Depth)
		})
	}
}

// However many delvers take the stairs at once, the party climbs one floor. A
// request that names stairs a climb has already cleared is dropped.
// FS-F6F88 §Requirements 21; §Edge States "Two delvers interact in the same tick".
func TestStairs_SimultaneousInteractions_ClimbOnce(t *testing.T) {
	c := newClimb(t)
	for _, playerID := range c.delvers {
		c.standAtStairs(t, playerID)
	}
	stairsID := c.stairs(t).ID

	var wg sync.WaitGroup
	for _, playerID := range c.delvers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = c.s.handleInteract(playerID, stairsID)
		}()
	}
	wg.Wait()
	// the same delvers again, in turn, before the loop gets to it
	for _, playerID := range c.delvers {
		_ = c.s.handleInteract(playerID, stairsID)
	}

	c.s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, c.s).Depth)

	// one who passed the gather check before the climb, and asked after it
	c.s.requestFloorChange(stairsID)
	c.s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, c.s).Depth, "a request for cleared stairs is not a second climb")

	// a stale frame still aiming at the old stairs
	assert.ErrorIs(t, c.s.handleInteract(c.delvers[0], stairsID), ErrEntityNotFound)
	c.s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, c.s).Depth)
}

// The stairs keep no cooldown after a refusal: the party gathers and the next
// interaction climbs, at once.
func TestStairs_RefusalDoesNotLockTheStairs(t *testing.T) {
	c := newClimb(t)
	c.standAtStairs(t, c.delvers[0])

	require.ErrorIs(t, c.interactWithStairs(t, c.delvers[0]), ErrPartyNotGathered)

	for _, playerID := range c.delvers {
		c.standAtStairs(t, playerID)
	}
	require.NoError(t, c.interactWithStairs(t, c.delvers[0]))
	c.s.applyRequestedFloorChange()
	assert.Equal(t, 2, currentFloor(t, c.s).Depth)
}

// The party climbs to the top without the run ending, and on every floor the
// switch unlocks that floor's escape door and the door lets a delver out.
// FS-F6F88 §Requirements 23, 24; AC "Escape and run end".
func TestStairs_ClimbingNeverEndsTheRun_AndEscapeWorksOnEveryFloor(t *testing.T) {
	for escapeFloor := 1; escapeFloor <= constants.RunFloorCount; escapeFloor++ {
		c := newClimb(t)
		s := c.s
		s.endSessionCh = make(chan bool, 1)

		for depth := 1; depth < escapeFloor; depth++ {
			for _, playerID := range c.delvers {
				c.standAtStairs(t, playerID)
			}
			require.NoError(t, c.interactWithStairs(t, c.delvers[0]))
			s.applyRequestedFloorChange()
			s.step(1.0/float64(constants.GameFrameRate), s.EntityManager.GetAllEntities())

			require.Equal(t, depth+1, currentFloor(t, s).Depth)
			assert.Empty(t, s.endSessionCh, "a climb never ends the run")
		}
		if escapeFloor == constants.RunFloorCount {
			assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeStairs), "no way up from the top")
		}

		wren := c.delvers[0]
		at := func(id uuid.UUID) (float64, float64) {
			e, ok := s.EntityManager.GetEntity(id)
			require.True(t, ok)
			tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
			return tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y
		}

		switchID := s.switchEntityIDs[0]
		x, y := at(switchID)
		c.moveTo(t, wren, x, y)
		require.NoError(t, s.handleInteract(wren, switchID), "floor %d switch", escapeFloor)

		// the player's own interaction cooldown is released after a moment
		s.mu.Lock()
		s.playerInteractedCache = map[uuid.UUID]bool{}
		s.mu.Unlock()

		x, y = at(s.exitDoorEntityID)
		c.moveTo(t, wren, x, y)
		require.NoError(t, s.handleInteract(wren, s.exitDoorEntityID), "floor %d escape door", escapeFloor)

		pc, _ := delverEntity(t, s, wren).GetComponent(ecs.ComponentTypePlayer)
		assert.True(t, pc.(*components.PlayerComponent).Escape, "escaped from floor %d", escapeFloor)
	}
}

// Monsters keep off the stairs: the stairs are part of what a monster may not
// stand on. FS-F6F88 §Requirements 7, with FS-77AB6 §Requirements 22.
func TestMapKeepOut_CoversTheStairs(t *testing.T) {
	em := ecs.NewEntityManager()
	CreateStairsEntity(em, StairsConfig{X: 500, Y: 400})

	covered := false
	for _, area := range mapKeepOut(em.GetAllEntities()) {
		if area.overlapsBody(500, 400, constants.PlayerRadius) {
			covered = true
		}
	}
	assert.True(t, covered, "a monster may not start on the stairs")
}
