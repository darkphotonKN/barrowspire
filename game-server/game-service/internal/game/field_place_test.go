package game

import (
	"errors"
	"sync"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 3–6, 11–15, 49. I-X2F2H-1.

// builtField is a channel of the Meadows with its map, not started: the test is
// the only thing ticking it.
func builtField(t *testing.T) *Session {
	t.Helper()

	place := GentleMeadows()
	layout, err := place.Layout.Layout()
	require.NoError(t, err)

	field := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, FieldBounds(place))
	field.InitialFieldMapObjects(place, layout)
	return field
}

// fieldLoadout is a level-3 character's equipped loadout: a sword they can wear
// and a helm two levels above them.
func fieldLoadout() *pb.GetLoadoutWithItemsResponse {
	return &pb.GetLoadoutWithItemsResponse{
		Weapon: &pb.ItemInstance{
			Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "weapon",
			Name: "Seax", RequiredLevel: 3,
		},
		Head: &pb.ItemInstance{
			Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "armor",
			ArmorSlot: "head", Name: "Barrow Helm", RequiredLevel: 5,
		},
	}
}

var fieldWren = types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 3, Experience: 900}

// The Meadows and the Forest are registered, the Forest built from the layout
// handed in. R4; FS-3QHQZ §Requirements 10.
func TestFieldPlaces_RegistersTheMeadowsAndTheForest(t *testing.T) {
	places := FieldPlaces(forestLayoutFor(t, forestSeed))

	require.Len(t, places, 2)
	assert.Equal(t, FieldGentleMeadows, places[0].ID)
	assert.Equal(t, FieldForlornForest, places[1].ID)
}

// A field world is its own kind, the place's size, with the entrance gate back
// to the hub and the layout's keep-out areas as obstacles. R1, R3.
func TestFieldWorld_BuildsThePlace(t *testing.T) {
	field := builtField(t)
	place := GentleMeadows()
	layout, _ := place.Layout.Layout()

	assert.Equal(t, types.WorldTypeField, field.WorldType())
	assert.Equal(t, FieldGentleMeadows, field.FieldID())
	assert.Equal(t, place.Width, field.mapWidth)
	assert.Equal(t, place.Height, field.mapHeight)

	gates, walls := 0, 0
	for _, entity := range field.EntityManager.GetAllEntities() {
		if gc, isGate := entity.GetComponent(ecs.ComponentTypeGate); isGate {
			gates++
			assert.Equal(t, components.GateDestinationHub, gc.(*components.GateComponent).Destination)
			tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
			assert.Equal(t, place.Entrance.X, tc.(*components.TransformComponent).X)
			assert.Equal(t, place.Entrance.Y, tc.(*components.TransformComponent).Y)
			ic, _ := entity.GetComponent(ecs.ComponentTypeInteractable)
			assert.Equal(t, place.EntranceRange, ic.(*components.InteractableComponent).Range)
		}
		if entity.HasComponent(ecs.ComponentTypeWall) {
			walls++
		}
	}
	assert.Equal(t, 1, gates, "one entrance gate")
	assert.Equal(t, len(layout.Obstacles), walls, "one keep-out wall per obstacle")
	assert.True(t, field.hasMonsters(), "a field ticks the monster systems")
}

// An accepted entry seats a fresh body at the arrival point from the loadout
// read before the lock, the level gate applied, and mints a visit. R11, R13.
func TestSeatVisitor_SeatsAtTheArrivalWearingTheLoadout(t *testing.T) {
	field := builtField(t)
	place := GentleMeadows()
	memberID := uuid.New()

	visit, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)

	assert.NotEqual(t, uuid.Nil, visit.ID, "a visit id is minted")
	assert.NotEqual(t, field.ID, visit.ID, "never the channel's own id")
	assert.Equal(t, memberID, visit.MemberID)
	assert.Equal(t, fieldWren.ID, visit.CharacterID)
	assert.Equal(t, FieldGentleMeadows, visit.Field)
	assert.False(t, visit.EnteredAt.IsZero(), "the entry time is recorded")

	body := delverEntity(t, field, memberID)
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	assert.Equal(t, place.Arrival.X, tc.(*components.TransformComponent).X)
	assert.Equal(t, place.Arrival.Y, tc.(*components.TransformComponent).Y)

	equipment := equipmentOf(t, field, body.ID)
	require.NotNil(t, equipment.WeaponSlot, "the level-3 sword is worn")
	assert.Nil(t, equipment.HeadSlot, "the level-5 helm is not worn")
	carriedIDs := inventory(t, field, body.ID).ItemIDs
	require.Len(t, carriedIDs, 1, "the helm is carried")
	assert.Equal(t, "Barrow Helm", itemsByID(field, carriedIDs)[0].Name)
}

// Two visits by one character are two visits: character-service keys its XP
// grants on the id. R13, R42.
func TestSeatVisitor_EveryVisitHasItsOwnID(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()

	first, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)
	_, ended := field.EndVisit(memberID)
	require.True(t, ended)

	second, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)

	assert.NotEqual(t, first.ID, second.ID)
}

// Seating is refused for a member already here (a stale enter), with no loadout
// read (never seated bare, D27), and in a world that is not a field.
func TestSeatVisitor_Refusals(t *testing.T) {
	t.Run("already here", func(t *testing.T) {
		field := builtField(t)
		memberID := uuid.New()
		_, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
		require.NoError(t, err)

		_, err = field.SeatVisitor(memberID, fieldWren, fieldLoadout())
		assert.ErrorIs(t, err, ErrAlreadyHere)
		assert.Len(t, field.GetPlayerIDs(), 1, "no second body")
	})

	t.Run("no loadout", func(t *testing.T) {
		field := builtField(t)
		memberID := uuid.New()

		_, err := field.SeatVisitor(memberID, fieldWren, nil)
		assert.ErrorIs(t, err, ErrNoLoadout)
		assert.False(t, field.HasPlayer(memberID))
	})

	t.Run("not a field", func(t *testing.T) {
		hub := builtHub()

		_, err := hub.SeatVisitor(uuid.New(), fieldWren, fieldLoadout())
		assert.ErrorIs(t, err, ErrNotAField)
	})
}

// Ending a visit takes the body and every item entity it held out of the field,
// and hands back the visit with where the character finished. R15, R16.
func TestEndVisit_RemovesTheBodyAndItsItems(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	entered, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)

	body := delverEntity(t, field, memberID)
	equipment := equipmentOf(t, field, body.ID)
	held := append(systems.WornIDs(equipment), inventory(t, field, body.ID).ItemIDs...)
	require.NotEmpty(t, held)

	visit, ended := field.EndVisit(memberID)
	require.True(t, ended)

	assert.Equal(t, entered.ID, visit.ID)
	assert.Equal(t, fieldWren.Level, visit.Level)
	assert.Equal(t, fieldWren.Experience, visit.Experience)
	assert.False(t, visit.LeftAt.IsZero())
	assert.False(t, field.HasPlayer(memberID))
	_, bodyLeft := field.EntityManager.GetEntity(body.ID)
	assert.False(t, bodyLeft, "the body is gone")
	for _, itemID := range held {
		_, itemLeft := field.EntityManager.GetEntity(itemID)
		assert.False(t, itemLeft, "item %s the body held is gone", itemID)
	}
}

// Whichever way out removes the body first ends the visit; every other finds
// nothing. R49.
func TestEndVisit_ExactlyOnceUnderRace(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)

	var wg sync.WaitGroup
	var mu sync.Mutex
	ended := 0
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, ok := field.EndVisit(memberID); ok {
				mu.Lock()
				ended++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	assert.Equal(t, 1, ended)
}

// Walking out is refused away from the entrance, while fallen, and for nobody
// here; at the entrance it ends the visit. R14, R15.
func TestLeaveThroughEntrance(t *testing.T) {
	place := GentleMeadows()

	tests := []struct {
		name    string
		x, y    float64
		fallen  bool
		wantErr error
	}{
		{"at the entrance", place.Entrance.X, place.Entrance.Y, false, nil},
		{"at the edge of its range", place.Entrance.X + place.EntranceRange, place.Entrance.Y, false, nil},
		{"away from it", place.Arrival.X + 200, place.Arrival.Y, false, ErrNotAtGate},
		{"fallen at the entrance", place.Entrance.X, place.Entrance.Y, true, ErrFallen},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field := builtField(t)
			memberID := uuid.New()
			_, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
			require.NoError(t, err)

			body := delverEntity(t, field, memberID)
			tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
			tc.(*components.TransformComponent).X = tt.x
			tc.(*components.TransformComponent).Y = tt.y
			tick(field)
			if tt.fallen {
				hc, _ := body.GetComponent(ecs.ComponentTypeHealth)
				hc.(*components.HealthComponent).CurrentHealth = 0
			}

			visit, err := field.LeaveThroughEntrance(memberID)
			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.True(t, field.HasPlayer(memberID), "a refused leave keeps the body")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, memberID, visit.MemberID)
			assert.False(t, field.HasPlayer(memberID))
		})
	}

	t.Run("nobody here", func(t *testing.T) {
		field := builtField(t)

		_, err := field.LeaveThroughEntrance(uuid.New())
		assert.True(t, errors.Is(err, ErrNotInThisWorld))
	})
}

// An empty field keeps ticking and is never ended by the end rule. R5, R6.
func TestFieldWorld_TicksEmptyAndNeverEnds(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)
	_, _ = field.EndVisit(memberID)

	for range 5 {
		tick(field)
	}

	select {
	case <-field.endSessionCh:
		t.Fatal("the end rule ended a field")
	default:
	}
	assert.False(t, field.Ended())
}
