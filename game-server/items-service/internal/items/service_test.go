package items

import (
	"context"
	"errors"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	"github.com/google/uuid"
	"google.golang.org/protobuf/proto"
)

func TestConvertSingleProtoItemtoItemInstance_RarityID(t *testing.T) {
	rarity := uuid.New()
	tests := []struct {
		name     string
		rarityID string
		want     *uuid.UUID
	}{
		{"rolled rarity is persisted", rarity.String(), &rarity},
		{"empty rarity means NULL", "", nil},
		{"malformed rarity keeps the item with NULL rarity", "not-a-uuid", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := (&service{}).ConvertSingleProtoItemtoItemInstance(&pb.Item{ItemType: "weapon", RarityId: tt.rarityID})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			switch {
			case tt.want == nil && got.RarityID != nil:
				t.Errorf("RarityID = %v, want nil", *got.RarityID)
			case tt.want != nil && (got.RarityID == nil || *got.RarityID != *tt.want):
				t.Errorf("RarityID = %v, want %v", got.RarityID, *tt.want)
			}
		})
	}
}

// freezeRepo stubs the one repository call FreezeItem makes. The embedded
// interface is nil: anything else the service reaches for panics the test.
type freezeRepo struct {
	Repository
	frozen bool
	err    error
}

func (r *freezeRepo) FreezeItem(ctx context.Context, itemID, sellerID uuid.UUID) (bool, error) {
	return r.frozen, r.err
}

func TestServiceFreezeItem(t *testing.T) {
	dbDown := errors.New("connection refused")

	tests := []struct {
		name    string
		repo    *freezeRepo
		wantErr error
	}{
		// the repo folds "just frozen" and "already frozen for this seller" into one true
		{name: "frozen or already frozen is success", repo: &freezeRepo{frozen: true}},
		{name: "wrong owner or status is a semantic impossibility", repo: &freezeRepo{frozen: false}, wantErr: ErrItemNotFreezable},
		{name: "infrastructure failure passes through, not as impossibility", repo: &freezeRepo{err: dbDown}, wantErr: dbDown},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&service{repo: tt.repo}).FreezeItem(context.Background(), uuid.New(), uuid.New())

			if tt.wantErr == nil && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr != nil && !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr == dbDown && errors.Is(err, ErrItemNotFreezable) {
				t.Fatalf("transient failure must not read as ErrItemNotFreezable: %v", err)
			}
		})
	}
}

// The listing is born with the ID minted at reserve, so ItemReserved must carry
// it (FS-NXP1W Req 24a).
func TestFormattedItemInstanceData_CarriesListingID(t *testing.T) {
	listingID := uuid.New()
	item := &ItemInstance{ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: uuid.New(), Status: "LISTED", ListingID: &listingID}

	data, err := (&service{}).formattedItemInstanceData(item, item.OwnerMemberID, 100, time.Now())
	if err != nil {
		t.Fatalf("format: %v", err)
	}

	var evt pb.ItemReservedEvent
	if err := proto.Unmarshal(data.ItemReservedEvent, &evt); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if evt.ListingId != listingID.String() {
		t.Errorf("ListingId = %q, want %q", evt.ListingId, listingID.String())
	}
}
