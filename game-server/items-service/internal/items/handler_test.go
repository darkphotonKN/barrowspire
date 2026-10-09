package items

import (
	"context"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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

// fakeLoadoutService serves GetLoadoutWithItems only, like fakeListService.
type fakeLoadoutService struct {
	Service
	loadout *LoadoutWithItems
}

func (f *fakeLoadoutService) GetLoadoutWithItems(context.Context, *GetLoadoutRequest) (*LoadoutWithItems, error) {
	return f.loadout, nil
}

// FS-BDA7X Req 30: every owned item says what level it needs, on both reads.
func TestHandler_ItemInstances_CarryRequiredLevel(t *testing.T) {
	instance := func(level int) *ItemInstance {
		return &ItemInstance{
			ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: uuid.New(),
			Source: "extracted", ItemType: "weapon", Name: "Blade", RequiredLevel: level,
		}
	}

	t.Run("ListItemInstances", func(t *testing.T) {
		h := NewHandler(&fakeListService{items: []*ItemInstance{instance(7)}}, nil)
		res, err := h.ListItemInstances(context.Background(), &pb.ListItemInstancesRequest{MemberId: uuid.NewString()})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got := res.Items[0].RequiredLevel; got != 7 {
			t.Errorf("RequiredLevel = %d, want 7", got)
		}
	})

	t.Run("GetLoadoutWithItems", func(t *testing.T) {
		h := NewHandler(&fakeLoadoutService{loadout: &LoadoutWithItems{Weapon: instance(7), Ring1: instance(3)}}, nil)
		res, err := h.GetLoadoutWithItems(context.Background(), &pb.GetLoadoutWithItemsRequest{MemberId: uuid.NewString()})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got := res.Weapon.RequiredLevel; got != 7 {
			t.Errorf("Weapon.RequiredLevel = %d, want 7", got)
		}
		if got := res.Ring_1.RequiredLevel; got != 3 {
			t.Errorf("Ring_1.RequiredLevel = %d, want 3", got)
		}
		if res.Head != nil {
			t.Errorf("Head = %v, want nil for an empty slot", res.Head)
		}
	})
}

// FS-4R9M9 R51: every owned item carries its item level and affixes on the wire.
func TestItemInstanceToProto_CarriesLevelAndAffixes(t *testing.T) {
	item := &ItemInstance{
		ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: uuid.New(),
		ItemType: "weapon", Name: "Blade", RequiredLevel: 6, ItemLevel: 9,
		Affixes: Affixes{{Stat: "strength", Tier: 2, Value: 3}, {Stat: "crit_chance", Tier: 1, Value: 1}},
	}

	got := itemInstanceToProto(item)

	if got.ItemLevel != 9 || got.RequiredLevel != 6 {
		t.Errorf("ItemLevel, RequiredLevel = %d, %d, want 9, 6", got.ItemLevel, got.RequiredLevel)
	}
	want := []*pb.Affix{{Stat: "strength", Tier: 2, Value: 3}, {Stat: "crit_chance", Tier: 1, Value: 1}}
	if len(got.Affixes) != len(want) {
		t.Fatalf("Affixes = %v, want %v", got.Affixes, want)
	}
	for i := range want {
		if got.Affixes[i].Stat != want[i].Stat || got.Affixes[i].Tier != want[i].Tier || got.Affixes[i].Value != want[i].Value {
			t.Errorf("Affixes[%d] = %v, want %v", i, got.Affixes[i], want[i])
		}
	}
}

// loadoutRepo serves one member's loadout and its worn weapon, and counts reads
// so a refused caller can be shown to reach no data at all.
type loadoutRepo struct {
	Repository
	owner  uuid.UUID
	weapon *ItemInstance
	reads  int
}

func (r *loadoutRepo) GetLoadout(_ context.Context, req *GetLoadoutRequest) (*Loadout, error) {
	r.reads++
	return &Loadout{MemberId: &r.owner, WeaponId: &r.weapon.ID}, nil
}

func (r *loadoutRepo) GetItemInstanceByID(context.Context, uuid.UUID) (*ItemInstance, error) {
	r.reads++
	return r.weapon, nil
}

// FS-4R9M9 R53: a loadout goes only to the member who wears it.
func TestHandler_GetLoadoutWithItems_OnlyTheOwnerReadsIt(t *testing.T) {
	owner := uuid.New()
	tests := []struct {
		name     string
		ctx      context.Context
		wantCode codes.Code
	}{
		{"own loadout is returned", commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner}), codes.OK},
		{"another member's loadout is refused", commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: uuid.New()}), codes.PermissionDenied},
		{"no caller is unauthenticated", context.Background(), codes.Unauthenticated},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &loadoutRepo{owner: owner, weapon: &ItemInstance{ID: uuid.New(), OwnerMemberID: owner, ItemType: "weapon", Name: "Blade"}}
			h := NewHandler(NewService(repo, nil, nil, nil), nil)

			res, err := h.GetLoadoutWithItems(tt.ctx, &pb.GetLoadoutWithItemsRequest{MemberId: owner.String()})

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
			}
			if tt.wantCode != codes.OK {
				if repo.reads != 0 {
					t.Errorf("refused caller reached the repository %d times", repo.reads)
				}
				return
			}
			if res.Weapon == nil || res.Weapon.Name != "Blade" {
				t.Errorf("Weapon = %v, want the owner's Blade", res.Weapon)
			}
		})
	}
}
