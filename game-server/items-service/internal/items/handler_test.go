package items

import (
	"context"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
)

// fakeListService serves ListItemInstances only; any other call panics on the
// nil embedded interface, so the handler cannot quietly reach for anything else.
type fakeListService struct {
	Service
	items []*ItemInstance
}

func (f *fakeListService) ListItemInstances(context.Context, *ListItemInstancesRequest) ([]*ItemInstance, error) {
	return f.items, nil
}

func TestHandler_ListItemInstances_CarriesStatus(t *testing.T) {
	tests := []struct {
		name   string
		status string
	}{
		{"untouched relic is available", "AVAILABLE"},
		{"relic reserved by create-listing is listed", "LISTED"},
		{"relic held for settlement is in escrow", "IN_ESCROW"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeListService{items: []*ItemInstance{{
				ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: uuid.New(),
				Source: "extracted", ItemType: "weapon", Name: "Blade", Status: tt.status,
			}}}
			h := NewHandler(svc, nil)

			res, err := h.ListItemInstances(context.Background(), &pb.ListItemInstancesRequest{MemberId: uuid.NewString()})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(res.Items) != 1 {
				t.Fatalf("got %d items, want 1", len(res.Items))
			}
			if got := res.Items[0].Status; got != tt.status {
				t.Errorf("Status = %q, want %q", got, tt.status)
			}
		})
	}
}
