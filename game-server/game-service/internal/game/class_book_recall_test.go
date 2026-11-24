package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §A R8, §E R25, §F R32. I-X2CMM-5.

// pageOnWire is the page as the owner's frame sends it in current_player.book.
func pageOnWire(t *testing.T, s *Session, owner uuid.UUID, id components.PageID) map[string]any {
	t.Helper()
	book := frameOf(t, s, types.WorldTypeRun, owner)["current_player"].(map[string]any)["book"].(map[string]any)
	for _, p := range book["pages"].([]any) {
		if page := p.(map[string]any); page["id"] == string(id) {
			return page
		}
	}
	t.Fatalf("page %s not on %s's book", id, owner)
	return nil
}

// standsOnGround is whether a body at (x, y) stands wholly on the floor's
// ground: every corner of it on a walkable cell and in no wall.
func standsOnGround(s *Session, x, y float64) bool {
	r := constants.PlayerRadius
	for _, corner := range [][2]float64{{x - r, y - r}, {x + r, y - r}, {x - r, y + r}, {x + r, y + r}} {
		if !s.pageGround(corner[0], corner[1]) {
			return false
		}
	}
	return true
}

// A level-17 mage in the start room recalls two teammates standing in two
// other rooms: after 3 s both stand within 2 cells of the mage, on ground and
// off every body; 50 mana is paid and recall is sent spent until the party
// climbs, then ready. AC 1; R8, R25, R32.
func TestCastSkill_RecallPullsTwoTeammatesFromOtherRooms(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	s.endSessionCh = make(chan bool, 64)
	require.NotNil(t, s.dungeon, "a dungeon floor")
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEnemy) {
			s.EntityManager.RemoveEntity(e.ID) // nothing to strike the mage mid-cast
		}
	}
	mage, mageBody := placeDelverAt(t, s, "mage", 17, 0, 0)
	start := s.dungeon.layout.Roles.Start
	centre := s.dungeon.roomCentre(start)
	transformOf(t, mageBody).X, transformOf(t, mageBody).Y = centre.x, centre.y
	require.True(t, standsOnGround(s, centre.x, centre.y), "the mage stands in the start room")

	var mates []*ecs.Entity
	for room := range s.dungeon.layout.Rooms {
		if room == start || len(mates) == 2 {
			continue
		}
		x, y, ok := s.dungeon.search(s.dungeon.roomRegion(room), constants.PlayerRadius, constants.PlayerRadius, footing{doorways: offDoorways})
		require.True(t, ok)
		_, body := placeDelverAt(t, s, "warrior", 17, x, y)
		mates = append(mates, body)
	}
	require.Len(t, mates, 2)
	manaBefore := currentResource(mageBody)

	require.NoError(t, castPageSkill(s, mage, "recall"))
	ticks(s, castTicks(3)+1)

	for i, mate := range mates {
		at := transformOf(t, mate)
		assert.LessOrEqual(t, math.Hypot(at.X-centre.x, at.Y-centre.y), 2*cell, "teammate %d within 2 cells", i)
		assert.True(t, standsOnGround(s, at.X, at.Y), "teammate %d on ground, in no wall", i)
		assert.Equal(t, s.dungeon.roomRegion(start), s.dungeon.regionAt(at.X, at.Y), "teammate %d in the mage's room", i)
	}
	assert.GreaterOrEqual(t, math.Hypot(transformOf(t, mates[0]).X-transformOf(t, mates[1]).X, transformOf(t, mates[0]).Y-transformOf(t, mates[1]).Y), 2*constants.PlayerRadius-1e-6, "not on each other")
	assert.Equal(t, manaBefore-50, currentResource(mageBody), "50 mana")
	assert.Equal(t, true, pageOnWire(t, s, mage, components.PageRecall)["spent"], "spent on the wire")

	require.NoError(t, s.regenerateFloor())
	assert.Equal(t, false, pageOnWire(t, s, mage, components.PageRecall)["spent"], "ready on the next floor")
}

// A solo mage, or one whose teammates are all dead or escaped, is refused at
// the cast with nothing spent. AC 2; R25.
func TestCastSkill_RecallWithNoOneToPullIsRefused(t *testing.T) {
	for _, tt := range []struct {
		name string
		mate func(t *testing.T, s *Session)
	}{
		{"solo", func(*testing.T, *Session) {}},
		{"every teammate dead or escaped", func(t *testing.T, s *Session) {
			_, dead := placeDelverAt(t, s, "warrior", 17, 900, 500)
			kill(t, dead)
			_, gone := placeDelverAt(t, s, "archer", 17, 900, 700)
			playerOf(gone).Escape = true
		}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			s.endSessionCh = make(chan bool, 64)
			mage, body := placeDelverAt(t, s, "mage", 17, 500, 500)
			tt.mate(t, s)
			manaBefore := currentResource(body)

			require.NoError(t, castPageSkill(s, mage, "recall"))
			assert.Nil(t, bookOf(t, body).Casting, "refused at the cast")
			ticks(s, castTicks(3)+1)

			assert.Equal(t, manaBefore, currentResource(body), "no mana")
			assert.Equal(t, false, pageOnWire(t, s, mage, components.PageRecall)["spent"], "not spent")
		})
	}
}

// A teammate opening a chest when the Recall completes is pulled and their
// timed open breaks: the chest stays shut. AC 3; R25.
func TestCastSkill_RecallBreaksATeammatesTimedOpen(t *testing.T) {
	s, opener, chest := worldWithShutChest(t, RunBounds())
	s.endSessionCh = make(chan bool, 64)
	mage, _ := placeDelverAt(t, s, "mage", 17, 1500, 500)
	openerBody := delverEntity(t, s, opener)

	require.NoError(t, castPageSkill(s, mage, "recall"))
	ticks(s, castTicks(3)-10)
	require.NoError(t, s.handleInteract(opener, chest.ID))
	require.NotNil(t, timedOpenOf(openerBody), "the teammate is opening the chest")
	ticks(s, 11)

	at := transformOf(t, openerBody)
	assert.LessOrEqual(t, math.Hypot(at.X-1500, at.Y-500), 2*cell, "recalled")
	assert.Nil(t, timedOpenOf(openerBody), "the timed open broke")
	ticks(s, timedOpenTicks())
	oc, _ := chest.GetComponent(ecs.ComponentTypeOpenable)
	assert.False(t, oc.(*components.OpenableComponent).IsOpen, "the chest stays shut")
}
