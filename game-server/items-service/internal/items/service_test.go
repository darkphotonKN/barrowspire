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
			got, err := (&service{}).ConvertSingleProtoItemtoItemInstance(uuid.New(), &pb.Item{TemplateId: uuid.NewString(), ItemType: "weapon", RarityId: tt.rarityID})
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

	data, err := (&service{}).formattedItemInstanceData(item, item.OwnerMemberID, 100, nil, time.Now())
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

// items-service forwards marketplace's buyout unread: present stays present,
// absent stays absent rather than becoming 0 (FS-9XKS6 Req 6).
func TestFormattedItemInstanceData_ForwardsBuyoutPrice(t *testing.T) {
	buyout := int64(900)

	tests := []struct {
		name   string
		buyout *int64
	}{
		{"set", &buyout},
		{"absent", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := &ItemInstance{ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: uuid.New(), Status: "LISTED"}

			data, err := (&service{}).formattedItemInstanceData(item, item.OwnerMemberID, 100, tt.buyout, time.Now())
			if err != nil {
				t.Fatalf("format: %v", err)
			}

			var evt pb.ItemReservedEvent
			if err := proto.Unmarshal(data.ItemReservedEvent, &evt); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if (evt.BuyoutPrice == nil) != (tt.buyout == nil) {
				t.Fatalf("BuyoutPrice presence = %v, want %v", evt.BuyoutPrice != nil, tt.buyout != nil)
			}
			if tt.buyout != nil && evt.GetBuyoutPrice() != *tt.buyout {
				t.Errorf("BuyoutPrice = %d, want %d", evt.GetBuyoutPrice(), *tt.buyout)
			}
		})
	}
}

// FS-4R9M9 R48-50: the consumer keeps an extracted item's level, its own
// required level and its well-formed affixes.
func TestConvertSingleProtoItemtoItemInstance_LevelAndAffixes(t *testing.T) {
	tests := []struct {
		name          string
		in            *pb.Item
		wantItemLevel int
		wantRequired  int
		wantAffixes   Affixes
	}{
		{
			name: "rolled item keeps level, required level and affixes",
			in: &pb.Item{ItemType: "weapon", ItemLevel: 9, RequiredLevel: 6, Affixes: []*pb.ItemAffix{
				{Stat: "strength", Tier: 2, Value: 3},
				{Stat: "crit_chance", Tier: 1, Value: 1},
			}},
			wantItemLevel: 9, wantRequired: 6,
			wantAffixes: Affixes{{Stat: "strength", Tier: 2, Value: 3}, {Stat: "crit_chance", Tier: 1, Value: 1}},
		},
		{
			name:          "older producer stores ilvl 1, no affixes, no required level of its own",
			in:            &pb.Item{ItemType: "weapon"},
			wantItemLevel: 1, wantRequired: 0, wantAffixes: Affixes{},
		},
		{
			name:          "a unique's fixed affix is tier 0",
			in:            &pb.Item{ItemType: "armor", ItemLevel: 20, RequiredLevel: 13, Affixes: []*pb.ItemAffix{{Stat: "max_health", Tier: 0, Value: 15}}},
			wantItemLevel: 20, wantRequired: 13, wantAffixes: Affixes{{Stat: "max_health", Tier: 0, Value: 15}},
		},
		{
			name: "malformed entries are dropped, the rest is kept",
			in: &pb.Item{ItemType: "weapon", ItemLevel: 3, Affixes: []*pb.ItemAffix{
				{Stat: "luck", Tier: 1, Value: 1},
				{Stat: "agility", Tier: 4, Value: 1},
				{Stat: "agility", Tier: -1, Value: 1},
				{Stat: "defense", Tier: 1, Value: -2},
				nil,
				{Stat: "flat_damage", Tier: 1, Value: 1},
			}},
			wantItemLevel: 3, wantRequired: 0, wantAffixes: Affixes{{Stat: "flat_damage", Tier: 1, Value: 1}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := (&service{}).ConvertSingleProtoItemtoItemInstance(uuid.New(), withTemplate(tt.in))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.ItemLevel != tt.wantItemLevel {
				t.Errorf("ItemLevel = %d, want %d", got.ItemLevel, tt.wantItemLevel)
			}
			if got.RequiredLevel != tt.wantRequired {
				t.Errorf("RequiredLevel = %d, want %d", got.RequiredLevel, tt.wantRequired)
			}
			if len(got.Affixes) != len(tt.wantAffixes) {
				t.Fatalf("Affixes = %+v, want %+v", got.Affixes, tt.wantAffixes)
			}
			for i := range tt.wantAffixes {
				if got.Affixes[i] != tt.wantAffixes[i] {
					t.Errorf("Affixes[%d] = %+v, want %+v", i, got.Affixes[i], tt.wantAffixes[i])
				}
			}
		})
	}
}

// withTemplate gives a fixture item the template every stored row needs.
func withTemplate(item *pb.Item) *pb.Item {
	item.TemplateId = uuid.NewString()
	return item
}
