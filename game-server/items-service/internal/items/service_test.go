package items

import (
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	"github.com/google/uuid"
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
