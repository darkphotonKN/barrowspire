package game

import (
	"context"
	"errors"
	"testing"

	pbevents "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// failingLoadoutClient is an items service that refuses every loadout read and
// checkout, as an expired token or an outage does.
type failingLoadoutClient struct {
	mockItemsClient
}

func (c *failingLoadoutClient) GetLoadoutWithItems(ctx context.Context, req *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	return nil, errors.New("items service unavailable")
}

func (c *failingLoadoutClient) CheckOutRunGear(ctx context.Context, req *pb.CheckOutRunGearRequest) (*pb.CheckOutRunGearResponse, error) {
	return nil, errors.New("items service unavailable")
}

// A delver seated without their stored loadout, because it could not be read,
// leaves the run with an extraction marked loadout unknown, so the settlement
// never takes their empty slots for the stored loadout and wipes it. A delver
// whose loadout was read, even an empty one, is not marked.
func TestEndSession_LoadoutNotReadAtSeating_ExtractionMarksLoadoutUnknown(t *testing.T) {
	character := types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 1}

	tests := []struct {
		name        string
		seat        func(t *testing.T, s *Session, memberID uuid.UUID)
		wantUnknown bool
	}{
		{
			name: "loadout read fails",
			seat: func(t *testing.T, s *Session, memberID uuid.UUID) {
				s.itemsClient = &failingLoadoutClient{}
				s.AddPlayer(memberID, character, "")
			},
			wantUnknown: true,
		},
		{
			name: "loadout read returns nothing",
			seat: func(t *testing.T, s *Session, memberID uuid.UUID) {
				s.itemsClient = &mockItemsClient{loadout: nil}
				s.AddPlayer(memberID, character, "")
			},
			wantUnknown: true,
		},
		{
			name: "handoff arrival seated without a loadout",
			seat: func(t *testing.T, s *Session, memberID uuid.UUID) {
				s.AddPlayersToPendingConnection([]*types.Player{{ID: memberID, Character: character}})
				_, err := s.SeatArrival(&types.Player{ID: memberID}, nil)
				require.NoError(t, err)
			},
			wantUnknown: true,
		},
		{
			name: "an empty loadout read",
			seat: func(t *testing.T, s *Session, memberID uuid.UUID) {
				s.itemsClient = &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{}}
				s.AddPlayer(memberID, character, "")
			},
			wantUnknown: false,
		},
		{
			name: "handoff arrival seated with its loadout",
			seat: func(t *testing.T, s *Session, memberID uuid.UUID) {
				s.AddPlayersToPendingConnection([]*types.Player{{ID: memberID, Character: character}})
				_, err := s.SeatArrival(&types.Player{ID: memberID}, &pb.CheckOutRunGearResponse{Loadout: &pb.GetLoadoutWithItemsResponse{}})
				require.NoError(t, err)
			},
			wantUnknown: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _, outbox := endableRun(t)
			memberID := uuid.New()
			tt.seat(t, s, memberID)

			markEscaped(t, delverEntity(t, s, memberID))
			s.endSession()

			var extracted *pbevents.PlayerItems
			for _, items := range outbox.itemsExtracted(t).PlayerItems {
				if items.MemberId == memberID.String() {
					extracted = items
				}
			}
			require.NotNil(t, extracted, "the delver is in the extraction")
			assert.Equal(t, tt.wantUnknown, extracted.LoadoutUnknown)
		})
	}
}
