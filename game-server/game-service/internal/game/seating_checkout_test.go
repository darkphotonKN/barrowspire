package game

import (
	"fmt"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// bagItem is a stored bag instance named name.
func bagItem(name string) *pb.ItemInstance {
	return &pb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "consumable", Name: name}
}

// itemNames is the name of each item entity, in order.
func itemNames(t *testing.T, s *Session, ids []uuid.UUID) []string {
	t.Helper()
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		entity, ok := s.EntityManager.GetEntity(id)
		require.True(t, ok, "item entity %s exists", id)
		c, ok := entity.GetComponent(ecs.ComponentTypeItem)
		require.True(t, ok)
		names = append(names, c.(*components.ItemComponent).Name)
	}
	return names
}

// A run seat checks the delver's gear out under the run's own id instead of
// reading it, and seats the bag it returns after the over-level carried items.
// FS-18Z5F §C R13, R17.
func TestAddPlayer_RunSeat_ChecksOutUnderTheRunIDAndSeatsTheBagAfterCarriedItems(t *testing.T) {
	client := &mockItemsClient{
		loadout: &pb.GetLoadoutWithItemsResponse{
			Weapon: &pb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "weapon", Name: "Seax", RequiredLevel: 1},
			Head:   &pb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "armor", ArmorSlot: "head", Name: "Barrow Helm", RequiredLevel: 9},
		},
		bag: []*pb.ItemInstance{bagItem("Rope"), bagItem("Torch")},
	}
	s, _ := equipRun(t, client)
	memberID := uuid.New()
	characterID := uuid.New()

	entityID := s.AddPlayer(memberID, types.CharacterInPlay{ID: characterID, Name: "Wren", Class: "warrior", Level: 3}, "")

	require.Len(t, client.checkouts, 1, "the seat checks out once")
	assert.Equal(t, memberID.String(), client.checkouts[0].GetMemberId())
	assert.Equal(t, s.ID.String(), client.checkouts[0].GetRunId(), "under the run's session id")
	assert.Equal(t, characterID.String(), client.checkouts[0].GetCharacterId(), "as the character in play (FS-50MTX R28)")
	assert.Empty(t, client.loadoutReads, "a run seat no longer reads the loadout")

	assert.Equal(t, []string{"Seax"}, itemNames(t, s, wornIDs(t, s, entityID)))
	assert.Equal(t, []string{"Barrow Helm", "Rope", "Torch"}, itemNames(t, s, inventory(t, s, entityID).ItemIDs),
		"over-level carried items first, then the bag in the order returned")
	assert.False(t, delverEntityLoadoutUnknown(t, s, memberID))
}

// The hub is not a run: it keeps the plain read and checks nothing out.
// FS-18Z5F §C R13.
func TestAddPlayer_HubSeat_ReadsTheLoadoutAndChecksNothingOut(t *testing.T) {
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{}, bag: []*pb.ItemInstance{bagItem("Rope")}}
	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, HubBounds())

	characterID := uuid.New()

	entityID := hub.AddPlayer(uuid.New(), types.CharacterInPlay{ID: characterID, Name: "Wren", Class: "warrior", Level: 3}, "")

	require.Len(t, client.loadoutReads, 1, "the hub reads the loadout")
	assert.Equal(t, characterID.String(), client.loadoutReads[0].GetCharacterId(), "as the character in play (FS-50MTX R28)")
	assert.Empty(t, client.checkouts, "the hub checks nothing out")
	assert.Empty(t, inventory(t, hub, entityID).ItemIDs, "the hub seats no bag")
}

// A member walked back to the hub reads the loadout as their character too.
// FS-50MTX R28.
func TestAddPlayerAt_HubSeat_ReadsAsTheCharacterInPlay(t *testing.T) {
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{}}
	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, HubBounds())
	characterID := uuid.New()

	hub.AddPlayerAt(uuid.New(), types.CharacterInPlay{ID: characterID, Name: "Wren", Class: "warrior", Level: 3}, "", 100, 100)

	require.Len(t, client.loadoutReads, 1)
	assert.Equal(t, characterID.String(), client.loadoutReads[0].GetCharacterId())
}

// No character is sent as empty, never as the zero UUID, so items-service
// refuses the read and the delver seats as loadout unknown instead of as a
// character with an empty loadout. FS-50MTX R28.
func TestAddPlayer_NoCharacter_SendsNoCharacterID(t *testing.T) {
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{}}
	s, _ := equipRun(t, client)

	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")

	require.Len(t, client.checkouts, 1)
	assert.Empty(t, client.checkouts[0].GetCharacterId())
}

// Seating is not capped: a legacy bag over capacity is seated in full.
// FS-18Z5F §C R17; FS-HRH2J R36.
func TestAddPlayer_RunSeat_BagOverCapacity_SeatsEveryItem(t *testing.T) {
	bag := make([]*pb.ItemInstance, 31)
	for i := range bag {
		bag[i] = bagItem(fmt.Sprintf("Pebble %d", i))
	}
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{}, bag: bag}
	s, _ := equipRun(t, client)

	entityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")

	assert.Len(t, inventory(t, s, entityID).ItemIDs, 31)
}

// A run seat whose checkout fails is seated bare and marked loadout unknown,
// as a failed read was. FS-18Z5F §C R15.
func TestAddPlayer_RunSeat_CheckoutFails_SeatsBareWithLoadoutUnknown(t *testing.T) {
	s, _ := equipRun(t, nil)
	s.itemsClient = &failingLoadoutClient{}
	memberID := uuid.New()

	entityID := s.AddPlayer(memberID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")

	assert.Empty(t, wornIDs(t, s, entityID))
	assert.Empty(t, inventory(t, s, entityID).ItemIDs)
	assert.True(t, delverEntityLoadoutUnknown(t, s, memberID))
}

// A delver already seated keeps the body they have: seating them again, as a
// reconnect into the run does, checks nothing out. FS-18Z5F §C R18.
func TestAddPlayer_RunSeat_AlreadySeated_ChecksOutOnce(t *testing.T) {
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{}}
	s, _ := equipRun(t, client)
	memberID := uuid.New()
	character := types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}

	first := s.AddPlayer(memberID, character, "")
	second := s.AddPlayer(memberID, character, "")

	assert.Equal(t, first, second)
	assert.Len(t, client.checkouts, 1)
}

// delverEntityLoadoutUnknown reports whether the member's body was seated
// without its stored loadout.
func delverEntityLoadoutUnknown(t *testing.T, s *Session, memberID uuid.UUID) bool {
	t.Helper()
	c, ok := delverEntity(t, s, memberID).GetComponent(ecs.ComponentTypePlayer)
	require.True(t, ok)
	return c.(*components.PlayerComponent).LoadoutUnknown
}

// A handoff arrival wears and carries the gear checked out for the run, the
// bag after the over-level carried items. FS-18Z5F §C R13, R17.
func TestSeatArrival_SeatsTheCheckedOutWornAndBag(t *testing.T) {
	s, _ := equipRun(t, nil)
	memberID := uuid.New()
	s.AddPlayersToPendingConnection([]*types.Player{{ID: memberID, Character: types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}}})
	gear := &pb.CheckOutRunGearResponse{
		Loadout: &pb.GetLoadoutWithItemsResponse{
			Weapon: &pb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "weapon", Name: "Seax", RequiredLevel: 9},
		},
		Bag: []*pb.ItemInstance{bagItem("Rope")},
	}

	_, err := s.SeatArrival(&types.Player{ID: memberID}, gear)
	require.NoError(t, err)

	entityID := delverEntity(t, s, memberID).ID
	assert.Empty(t, wornIDs(t, s, entityID), "the over-level seax is carried")
	assert.Equal(t, []string{"Seax", "Rope"}, itemNames(t, s, inventory(t, s, entityID).ItemIDs))
	assert.False(t, delverEntityLoadoutUnknown(t, s, memberID))
}

// A handoff seat names the character on its pending entry, for the checkout
// that runs before the arrival is seated; a member with no pending entry has
// none. FS-50MTX R29.
func TestHandoffSeatOf_ExpectedMember_NamesThePendingCharacter(t *testing.T) {
	s, _ := equipRun(t, nil)
	expected := uuid.New()
	character := types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 3}
	s.AddPlayersToPendingConnection([]*types.Player{{ID: expected, Character: character}})

	seat, got := s.HandoffSeatOf(expected)
	assert.Equal(t, HandoffSeatExpected, seat)
	assert.Equal(t, character, got)

	seat, got = s.HandoffSeatOf(uuid.New())
	assert.Equal(t, HandoffSeatNone, seat)
	assert.Equal(t, types.CharacterInPlay{}, got)

	_, err := s.SeatArrival(&types.Player{ID: expected}, nil)
	require.NoError(t, err)
	seat, got = s.HandoffSeatOf(expected)
	assert.Equal(t, HandoffSeatTaken, seat)
	assert.Equal(t, types.CharacterInPlay{}, got)
}

// A field visitor carries the checked-out bag after the over-level carried
// items. FS-18Z5F §C R13, R17.
func TestSeatVisitor_SeatsTheCheckedOutBag(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	gear := fieldGear()
	gear.Bag = []*pb.ItemInstance{bagItem("Rope"), bagItem("Torch")}

	_, err := field.SeatVisitor(memberID, fieldWren, uuid.New(), gear)
	require.NoError(t, err)

	entityID := delverEntity(t, field, memberID).ID
	assert.Equal(t, []string{"Barrow Helm", "Rope", "Torch"}, itemNames(t, field, inventory(t, field, entityID).ItemIDs))
}
