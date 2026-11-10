package items

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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
	frozen     bool
	err        error
	gotListing uuid.UUID
}

func (r *freezeRepo) FreezeItem(ctx context.Context, itemID, sellerID, listingID uuid.UUID) (bool, error) {
	r.gotListing = listingID
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
			listingID := uuid.New()
			err := (&service{repo: tt.repo}).FreezeItem(context.Background(), uuid.New(), uuid.New(), listingID)
			if tt.repo.gotListing != listingID {
				t.Errorf("repo got listing %v, want %v", tt.repo.gotListing, listingID)
			}

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

// transferRepo stubs the one repository call TransferItem makes, and records the
// IDs it was handed so the test can see they arrive in the right order.
type transferRepo struct {
	Repository
	transferred bool
	err         error

	gotItemID, gotBuyerID, gotListingID uuid.UUID
}

func (r *transferRepo) TransferItem(ctx context.Context, itemID, buyerID, listingID uuid.UUID) (bool, error) {
	r.gotItemID, r.gotBuyerID, r.gotListingID = itemID, buyerID, listingID
	return r.transferred, r.err
}

func TestServiceTransferItem(t *testing.T) {
	dbDown := errors.New("connection refused")

	tests := []struct {
		name    string
		repo    *transferRepo
		wantErr error
	}{
		// the repo folds "just transferred" and "already transferred to this buyer" into one true
		{name: "transferred or already transferred is success", repo: &transferRepo{transferred: true}},
		{name: "not frozen for this listing is a semantic impossibility", repo: &transferRepo{transferred: false}, wantErr: ErrItemNotTransfer},
		{name: "infrastructure failure passes through, not as impossibility", repo: &transferRepo{err: dbDown}, wantErr: dbDown},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			itemID, buyerID, listingID := uuid.New(), uuid.New(), uuid.New()

			err := (&service{repo: tt.repo}).TransferItem(context.Background(), itemID, buyerID, listingID)

			if tt.wantErr == nil && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr != nil && !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr == dbDown && errors.Is(err, ErrItemNotTransfer) {
				t.Fatalf("transient failure must not read as ErrItemNotTransfer: %v", err)
			}
			if tt.repo.gotItemID != itemID || tt.repo.gotBuyerID != buyerID || tt.repo.gotListingID != listingID {
				t.Errorf("repo got (item %v, buyer %v, listing %v), want (%v, %v, %v)",
					tt.repo.gotItemID, tt.repo.gotBuyerID, tt.repo.gotListingID, itemID, buyerID, listingID)
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

// unfreezeRepo stubs the one repository call UnfreezeItem makes, and records the
// IDs it was handed so the test can see they arrive in the right order.
type unfreezeRepo struct {
	Repository
	err error

	gotItemID, gotSellerID, gotListingID uuid.UUID
}

func (r *unfreezeRepo) UnfreezeItem(ctx context.Context, itemID, sellerID, listingID uuid.UUID) error {
	r.gotItemID, r.gotSellerID, r.gotListingID = itemID, sellerID, listingID
	return r.err
}

// UnfreezeItem is the pre-pivot rollback (FS-NXP1W Req 12). The repository
// already treats every unmatched row as success, so the service only hands the
// IDs through and lets a database failure reach Temporal to be retried.
func TestServiceUnfreezeItem(t *testing.T) {
	dbDown := errors.New("connection refused")

	tests := []struct {
		name    string
		repoErr error
		wantErr error
	}{
		{name: "unfrozen or nothing to do is success"},
		{name: "a database failure is returned for a retry", repoErr: dbDown, wantErr: dbDown},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &unfreezeRepo{err: tt.repoErr}
			itemID, sellerID, listingID := uuid.New(), uuid.New(), uuid.New()

			err := (&service{repo: repo}).UnfreezeItem(context.Background(), itemID, sellerID, listingID)

			if !errors.Is(err, tt.wantErr) || (tt.wantErr == nil && err != nil) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if repo.gotItemID != itemID || repo.gotSellerID != sellerID || repo.gotListingID != listingID {
				t.Errorf("repo got (item %v, seller %v, listing %v), want (%v, %v, %v)",
					repo.gotItemID, repo.gotSellerID, repo.gotListingID, itemID, sellerID, listingID)
			}
		})
	}
}

// gearRepo serves one loadout and answers each instance read from items/errs
// by id: an id in neither reads as not found (nil, nil), the way the
// repository reports an instance that no longer exists.
type gearRepo struct {
	Repository
	loadout *Loadout
	items   map[uuid.UUID]*ItemInstance
	errs    map[uuid.UUID]error
}

func (r *gearRepo) GetLoadout(context.Context, *GetLoadoutRequest) (*Loadout, error) {
	return r.loadout, nil
}

func (r *gearRepo) GetItemInstanceByID(_ context.Context, id uuid.UUID) (*ItemInstance, error) {
	if err, ok := r.errs[id]; ok {
		return nil, err
	}
	return r.items[id], nil
}

// A slot whose instance read fails must fail the whole loadout read: reading
// it as empty is what let settlement NULL a worn item. A slot whose instance
// is genuinely gone stays empty, so one deleted item never locks a player out.
func TestServiceGetLoadoutWithItems_SlotReads(t *testing.T) {
	owner := uuid.New()
	weaponID, helmID := uuid.New(), uuid.New()
	weapon := &ItemInstance{ID: weaponID, OwnerMemberID: owner, ItemType: "weapon", Name: "Blade"}
	helm := &ItemInstance{ID: helmID, OwnerMemberID: owner, ItemType: "armor", Name: "Helm"}
	dbDown := errors.New("connection refused")

	tests := []struct {
		name     string
		items    map[uuid.UUID]*ItemInstance
		errs     map[uuid.UUID]error
		wantErr  error
		wantHead *ItemInstance
	}{
		{"every slot reads", map[uuid.UUID]*ItemInstance{weaponID: weapon, helmID: helm}, nil, nil, helm},
		{"a slot read error fails the whole read", map[uuid.UUID]*ItemInstance{weaponID: weapon}, map[uuid.UUID]error{helmID: dbDown}, dbDown, nil},
		{"a slot whose instance is gone reads empty", map[uuid.UUID]*ItemInstance{weaponID: weapon}, nil, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &gearRepo{
				loadout: &Loadout{MemberId: &owner, WeaponId: &weaponID, HeadId: &helmID},
				items:   tt.items,
				errs:    tt.errs,
			}

			got, err := NewService(repo, nil, nil, nil, nil, everyCharacterOwned{}).GetLoadoutWithItems(context.Background(), owner, &GetLoadoutRequest{MemberId: owner, CharacterId: uuid.New()})

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if got != nil {
					t.Errorf("loadout = %+v, want none on a failed read", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Weapon != weapon {
				t.Errorf("Weapon = %v, want the Blade", got.Weapon)
			}
			if got.Head != tt.wantHead {
				t.Errorf("Head = %v, want %v", got.Head, tt.wantHead)
			}
		})
	}
}

// moveRepo stubs the four calls a move makes, in a transaction run inline, and
// records the order they come in. The embedded interface is nil: anything else
// the service reaches for panics the test.
type moveRepo struct {
	Repository
	placement *ItemPlacement
	counts    map[string]int
	moved     bool
	countErr  error

	calls      []string
	lockedFor  uuid.UUID
	countedAt  string
	movedTo    string
	movedOwner uuid.UUID
}

func (r *moveRepo) LockAccountTx(_ context.Context, _ *sqlx.Tx, member uuid.UUID) error {
	r.calls = append(r.calls, "lock")
	r.lockedFor = member
	return nil
}

func (r *moveRepo) ItemPlacementTx(_ context.Context, _ *sqlx.Tx, _, _ uuid.UUID) (*ItemPlacement, error) {
	r.calls = append(r.calls, "read")
	return r.placement, nil
}

func (r *moveRepo) CountUnwornAtTx(_ context.Context, _ *sqlx.Tx, _ uuid.UUID, location string) (int, error) {
	r.calls = append(r.calls, "count")
	r.countedAt = location
	return r.counts[location], r.countErr
}

func (r *moveRepo) CountUnwornInBagTx(_ context.Context, _ *sqlx.Tx, _, _ uuid.UUID) (int, error) {
	r.calls = append(r.calls, "count")
	r.countedAt = LocationBag
	return r.counts[LocationBag], r.countErr
}

func (r *moveRepo) MoveItemInstanceTx(_ context.Context, _ *sqlx.Tx, owner, _, _ uuid.UUID, location string) (bool, error) {
	r.calls = append(r.calls, "write")
	r.movedOwner, r.movedTo = owner, location
	return r.moved, nil
}

// FS-VPD8Y R10: the checks run in order and the first failing one answers; a
// no-op succeeds even into a full location; the caps refuse growth and never
// remove (R5); the write is conditional and a lost race is ITEM_NOT_AVAILABLE.
func TestServiceMoveItemInstance_Rules(t *testing.T) {
	inBag := func(status string) *ItemPlacement {
		return &ItemPlacement{Status: status, Location: LocationBag}
	}
	dbDown := errors.New("connection refused")

	tests := []struct {
		name         string
		to           string
		repo         *moveRepo
		wantLocation string
		wantErr      error
		wantRefusal  errcode.Code
		wantCalls    []string
	}{
		{name: "unknown or foreign instance is not found", to: LocationStash,
			repo: &moveRepo{}, wantErr: commonconstants.ErrNotFound, wantCalls: []string{"lock", "read"}},
		{name: "worn is refused before its status is looked at", to: LocationStash,
			repo:        &moveRepo{placement: &ItemPlacement{Status: "LISTED", Location: LocationBag, Worn: true}},
			wantRefusal: errcode.ItemWorn, wantCalls: []string{"lock", "read"}},
		{name: "listed is not available", to: LocationStash,
			repo: &moveRepo{placement: inBag("LISTED")}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "pending settlement is not available", to: LocationStash,
			repo: &moveRepo{placement: inBag("PENDING_SETTLEMENT")}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "a later status is not available either", to: LocationStash,
			repo: &moveRepo{placement: inBag("IN_RUN")}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "same location succeeds and writes nothing, even when full", to: LocationBag,
			repo:         &moveRepo{placement: inBag("AVAILABLE"), counts: map[string]int{LocationBag: 40}},
			wantLocation: LocationBag, wantCalls: []string{"lock", "read"}},
		{name: "bag to stash under the cap moves", to: LocationStash,
			repo:         &moveRepo{placement: inBag("AVAILABLE"), counts: map[string]int{LocationStash: StashCapacity - 1}, moved: true},
			wantLocation: LocationStash, wantCalls: []string{"lock", "read", "count", "write"}},
		{name: "stash at its cap is full", to: LocationStash,
			repo:        &moveRepo{placement: inBag("AVAILABLE"), counts: map[string]int{LocationStash: StashCapacity}},
			wantRefusal: errcode.StashFull, wantCalls: []string{"lock", "read", "count"}},
		{name: "stash to bag at its cap is full", to: LocationBag,
			repo:        &moveRepo{placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationStash}, counts: map[string]int{LocationBag: BagCapacity}},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "read", "count"}},
		{name: "an over-cap bag refuses a move in", to: LocationBag,
			repo:        &moveRepo{placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationStash}, counts: map[string]int{LocationBag: BagCapacity + 5}},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "read", "count"}},
		{name: "an over-cap bag still lets a move out through", to: LocationStash,
			repo:         &moveRepo{placement: inBag("AVAILABLE"), counts: map[string]int{LocationBag: BagCapacity + 5, LocationStash: 3}, moved: true},
			wantLocation: LocationStash, wantCalls: []string{"lock", "read", "count", "write"}},
		{name: "a write that loses a race to a listing is not available", to: LocationStash,
			repo:        &moveRepo{placement: inBag("AVAILABLE"), moved: false},
			wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read", "count", "write"}},
		{name: "a count failure is returned, not read as a refusal", to: LocationStash,
			repo:    &moveRepo{placement: inBag("AVAILABLE"), countErr: dbDown},
			wantErr: dbDown, wantCalls: []string{"lock", "read", "count"}},
		{name: "an unknown location is invalid input and touches nothing", to: "WORN",
			repo: &moveRepo{}, wantErr: commonconstants.ErrInvalidInput},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller, itemID := uuid.New(), uuid.New()
			svc := &service{repo: tt.repo, withTx: runInline, characters: everyCharacterOwned{}}

			got, err := svc.MoveItemInstance(context.Background(), caller, &MoveItemInstanceRequest{ItemInstanceID: itemID, Location: tt.to})

			switch {
			case tt.wantRefusal != "":
				var refusal *errcode.Refusal
				if !errors.As(err, &refusal) || refusal.Code != tt.wantRefusal {
					t.Fatalf("err = %v, want refusal %s", err, tt.wantRefusal)
				}
			case tt.wantErr != nil:
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				var refusal *errcode.Refusal
				if errors.As(err, &refusal) {
					t.Fatalf("err = %v, must not read as a refusal", err)
				}
			default:
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got != tt.wantLocation {
					t.Errorf("location = %q, want %q", got, tt.wantLocation)
				}
			}

			if strings.Join(tt.repo.calls, ",") != strings.Join(tt.wantCalls, ",") {
				t.Errorf("calls = %v, want %v", tt.repo.calls, tt.wantCalls)
			}
			if len(tt.repo.calls) > 0 && tt.repo.lockedFor != caller {
				t.Errorf("locked account %v, want the caller %v", tt.repo.lockedFor, caller)
			}
			if tt.repo.countedAt != "" && tt.repo.countedAt != tt.to {
				t.Errorf("counted %q, want the destination %q", tt.repo.countedAt, tt.to)
			}
			if tt.repo.movedTo != "" && (tt.repo.movedTo != tt.to || tt.repo.movedOwner != caller) {
				t.Errorf("wrote (%v, %q), want (%v, %q)", tt.repo.movedOwner, tt.repo.movedTo, caller, tt.to)
			}
		})
	}
}

// loadoutWriteRepo stubs what a loadout write reaches for, in a transaction
// run inline, and records the order the calls come in. The embedded interface
// is nil: anything else the service reaches for panics the test.
type loadoutWriteRepo struct {
	Repository
	worn      *uuid.UUID     // the slot's instance before the write
	placement *ItemPlacement // the equipped instance's placement
	bagCount  int
	countErr  error

	calls     []string
	lockedFor uuid.UUID
	equipped  *UpdateLoadoutRequest
	held      []uuid.UUID
	heldBy    uuid.UUID
}

func (r *loadoutWriteRepo) LockAccountTx(_ context.Context, _ *sqlx.Tx, member uuid.UUID) error {
	r.calls = append(r.calls, "lock")
	r.lockedFor = member
	return nil
}

func (r *loadoutWriteRepo) LoadoutSlotTx(_ context.Context, _ *sqlx.Tx, _, _ uuid.UUID, _ string) (*uuid.UUID, error) {
	r.calls = append(r.calls, "slot")
	return r.worn, nil
}

func (r *loadoutWriteRepo) LockItemPlacementTx(_ context.Context, _ *sqlx.Tx, _, _ uuid.UUID) (*ItemPlacement, error) {
	r.calls = append(r.calls, "read")
	return r.placement, nil
}

func (r *loadoutWriteRepo) CountUnwornInBagTx(_ context.Context, _ *sqlx.Tx, _, _ uuid.UUID) (int, error) {
	r.calls = append(r.calls, "count:"+LocationBag)
	return r.bagCount, r.countErr
}

func (r *loadoutWriteRepo) UpsertLoadoutSlotTx(_ context.Context, _ *sqlx.Tx, req *UpdateLoadoutRequest) error {
	r.calls = append(r.calls, "equip")
	r.equipped = req
	return nil
}

func (r *loadoutWriteRepo) HoldInBagTx(_ context.Context, _ *sqlx.Tx, _, character, itemID uuid.UUID) error {
	r.calls = append(r.calls, "hold")
	r.held = append(r.held, itemID)
	r.heldBy = character
	return nil
}

// FS-VPD8Y R16-R19: under the account lock, an unequip or a swap sends the
// slot's instance to the bag in the same transaction; a write that would grow
// a bag at or over 30 is refused with BAG_FULL and writes nothing; a bag-item
// swap is net zero and an equip into an empty slot shrinks the bag, so both
// always pass; equipping from the stash is never refused for being stash.
func TestServiceUpdateLoadout_KeepsTheBagHonest(t *testing.T) {
	worn, equip := uuid.New(), uuid.New()
	fromBag := &ItemPlacement{Status: "AVAILABLE", Location: LocationBag}
	fromStash := &ItemPlacement{Status: "AVAILABLE", Location: LocationStash}
	dbDown := errors.New("connection refused")

	tests := []struct {
		name         string
		equip        *uuid.UUID
		repo         *loadoutWriteRepo
		wantRefusal  errcode.Code
		wantErr      error
		wantCalls    []string
		wantToTheBag bool
	}{
		{name: "unequip under the cap sends the item to the bag", equip: nil,
			repo:      &loadoutWriteRepo{worn: &worn, bagCount: BagCapacity - 1},
			wantCalls: []string{"lock", "slot", "count:BAG", "equip", "hold"}, wantToTheBag: true},
		{name: "unequip into a bag of 30 is refused and writes nothing", equip: nil,
			repo:        &loadoutWriteRepo{worn: &worn, bagCount: BagCapacity},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "slot", "count:BAG"}},
		{name: "unequip into a bag over 30 is refused and removes nothing", equip: nil,
			repo:        &loadoutWriteRepo{worn: &worn, bagCount: BagCapacity + 7},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "slot", "count:BAG"}},
		{name: "unequip of an empty slot counts nothing and moves nothing", equip: nil,
			repo:      &loadoutWriteRepo{bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "equip"}},
		{name: "a bag-item swap at 30 is net zero and passes", equip: &equip,
			repo:      &loadoutWriteRepo{worn: &worn, placement: fromBag, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip", "hold", "hold"}, wantToTheBag: true},
		{name: "a stash-item swap under the cap sends the displaced item to the bag", equip: &equip,
			repo:      &loadoutWriteRepo{worn: &worn, placement: fromStash, bagCount: 4},
			wantCalls: []string{"lock", "slot", "read", "count:BAG", "equip", "hold", "hold"}, wantToTheBag: true},
		{name: "a stash-item swap into a bag of 30 grows it and is refused", equip: &equip,
			repo:        &loadoutWriteRepo{worn: &worn, placement: fromStash, bagCount: BagCapacity},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "slot", "read", "count:BAG"}},
		{name: "swapping in an item worn in another slot grows the bag", equip: &equip,
			repo:        &loadoutWriteRepo{worn: &worn, placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationBag, Worn: true}, bagCount: BagCapacity},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "slot", "read", "count:BAG"}},
		{name: "equip into an empty slot at 30 always passes", equip: &equip,
			repo:      &loadoutWriteRepo{placement: fromBag, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip", "hold"}},
		{name: "equip from the stash into an empty slot is not refused", equip: &equip,
			repo:      &loadoutWriteRepo{placement: fromStash, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip", "hold"}},
		{name: "re-equipping the worn item displaces nothing", equip: &worn,
			repo:      &loadoutWriteRepo{worn: &worn, placement: fromBag, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip", "hold"}},
		{name: "a count failure is returned, not read as a refusal", equip: nil,
			repo:    &loadoutWriteRepo{worn: &worn, countErr: dbDown},
			wantErr: dbDown, wantCalls: []string{"lock", "slot", "count:BAG"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller, character := uuid.New(), uuid.New()
			svc := &service{repo: tt.repo, withTx: runInline, characters: everyCharacterOwned{}}
			req := &UpdateLoadoutRequest{MemberId: caller, CharacterId: character, Slot: "weapon", ItemInstanceId: tt.equip}

			err := svc.UpdateLoadout(context.Background(), caller, req)

			var refusal *errcode.Refusal
			switch {
			case tt.wantRefusal != "":
				if !errors.As(err, &refusal) || refusal.Code != tt.wantRefusal {
					t.Fatalf("err = %v, want refusal %s", err, tt.wantRefusal)
				}
			case tt.wantErr != nil:
				if !errors.Is(err, tt.wantErr) || errors.As(err, &refusal) {
					t.Fatalf("err = %v, want %v and no refusal", err, tt.wantErr)
				}
			case err != nil:
				t.Fatalf("unexpected error: %v", err)
			}

			if got := strings.Join(tt.repo.calls, ","); got != strings.Join(tt.wantCalls, ",") {
				t.Errorf("calls = %v, want %v", tt.repo.calls, tt.wantCalls)
			}
			if tt.repo.lockedFor != caller {
				t.Errorf("locked account %v, want the caller %v", tt.repo.lockedFor, caller)
			}
			if tt.repo.equipped != nil && tt.repo.equipped != req {
				t.Errorf("equipped %+v, want the request %+v", tt.repo.equipped, req)
			}
			if tt.wantToTheBag && !slices.Contains(tt.repo.held, worn) {
				t.Errorf("held %v, want the slot's instance %v among them", tt.repo.held, worn)
			}
			if len(tt.repo.held) > 0 && tt.repo.heldBy != character {
				t.Errorf("held by %v, want the request's character %v", tt.repo.heldBy, character)
			}
		})
	}
}

// FS-18Z5F R32: equipping an instance that is not AVAILABLE (in a run, listed
// or pending settlement) is refused with ITEM_NOT_AVAILABLE under the account
// lock, after the instance is read and before anything is written, whatever
// the slot held; clearing a slot reads no instance and is never refused for it.
func TestServiceUpdateLoadout_RefusesAnItemNotAvailable(t *testing.T) {
	worn, equip := uuid.New(), uuid.New()

	tests := []struct {
		name      string
		status    string
		worn      *uuid.UUID
		equip     *uuid.UUID
		wantRefus bool
		wantCalls []string
	}{
		{name: "in a run, into an empty slot", status: itemStatusInRun, equip: &equip,
			wantRefus: true, wantCalls: []string{"lock", "slot", "read"}},
		{name: "in a run, swapped in", status: itemStatusInRun, worn: &worn, equip: &equip,
			wantRefus: true, wantCalls: []string{"lock", "slot", "read"}},
		{name: "listed", status: "LISTED", equip: &equip,
			wantRefus: true, wantCalls: []string{"lock", "slot", "read"}},
		{name: "pending settlement", status: "PENDING_SETTLEMENT", equip: &equip,
			wantRefus: true, wantCalls: []string{"lock", "slot", "read"}},
		{name: "re-equipping a worn item now in a run", status: itemStatusInRun, worn: &worn, equip: &worn,
			wantRefus: true, wantCalls: []string{"lock", "slot", "read"}},
		{name: "available equips", status: itemStatusAvailable, equip: &equip,
			wantCalls: []string{"lock", "slot", "read", "equip", "hold"}},
		{name: "clearing a slot whatever its item is not checked", status: itemStatusInRun, worn: &worn,
			wantCalls: []string{"lock", "slot", "count:BAG", "equip", "hold"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller := uuid.New()
			repo := &loadoutWriteRepo{worn: tt.worn, placement: &ItemPlacement{Status: tt.status, Location: LocationBag}}
			svc := &service{repo: repo, withTx: runInline, characters: everyCharacterOwned{}}

			err := svc.UpdateLoadout(context.Background(), caller,
				&UpdateLoadoutRequest{MemberId: caller, Slot: "weapon", ItemInstanceId: tt.equip})

			var refusal *errcode.Refusal
			switch {
			case tt.wantRefus:
				if !errors.As(err, &refusal) || refusal.Code != errcode.ItemNotAvailable {
					t.Fatalf("err = %v, want refusal %s", err, errcode.ItemNotAvailable)
				}
			case err != nil:
				t.Fatalf("unexpected error: %v", err)
			}
			if got := strings.Join(repo.calls, ","); got != strings.Join(tt.wantCalls, ",") {
				t.Errorf("calls = %v, want %v", repo.calls, tt.wantCalls)
			}
		})
	}
}

// reserveRepo stubs the four calls a reservation makes, in a transaction run
// inline, and records the order they come in. The embedded interface is nil:
// anything else the service reaches for panics the test.
type reserveRepo struct {
	Repository
	placement  *ItemPlacement
	listed     int
	countErr   error
	reserveErr error

	calls     []string
	lockedFor uuid.UUID
	readFor   uuid.UUID
	countFor  uuid.UUID
}

func (r *reserveRepo) LockAccountTx(_ context.Context, _ *sqlx.Tx, member uuid.UUID) error {
	r.calls = append(r.calls, "lock")
	r.lockedFor = member
	return nil
}

func (r *reserveRepo) ItemPlacementTx(_ context.Context, _ *sqlx.Tx, owner, _ uuid.UUID) (*ItemPlacement, error) {
	r.calls = append(r.calls, "read")
	r.readFor = owner
	return r.placement, nil
}

func (r *reserveRepo) CountListedTx(_ context.Context, _ *sqlx.Tx, seller uuid.UUID) (int, error) {
	r.calls = append(r.calls, "count")
	r.countFor = seller
	return r.listed, r.countErr
}

func (r *reserveRepo) ReserveItemTx(_ context.Context, _ *sqlx.Tx, sellerID, itemID, listingID uuid.UUID, _ time.Time) (*ItemInstance, error) {
	r.calls = append(r.calls, "reserve")
	if r.reserveErr != nil {
		return nil, r.reserveErr
	}
	return &ItemInstance{ID: itemID, TemplateID: uuid.New(), OwnerMemberID: sellerID, Status: "LISTED", ListingID: &listingID}, nil
}

// recordingOutbox records the outbox rows a service writes.
type recordingOutbox struct {
	rows []commonoutbox.OutboxParams
}

func (o *recordingOutbox) CreateOutbox(_ context.Context, params commonoutbox.OutboxParams) error {
	o.rows = append(o.rows, params)
	return nil
}

func (o *recordingOutbox) CreateOutboxTx(_ context.Context, _ *sqlx.Tx, params commonoutbox.OutboxParams) error {
	o.rows = append(o.rows, params)
	return nil
}

// FS-HBXZN R1-R4: under the seller's account lock the placement is read, and
// the first failing check answers: not the seller's → ErrNotFound; not
// AVAILABLE → ITEM_NOT_AVAILABLE, worn or not; worn → ITEM_WORN; not in the
// stash → ITEM_NOT_IN_STASH (FS-3R77D R2, R4). Then the
// seller's listed items are counted, and at the cap the reserve is refused
// LISTING_LIMIT_REACHED (FS-XEDFF R5, R6, R8). Only then is the conditional
// reserve run, and a reserve that matches no row is ITEM_NOT_AVAILABLE. A
// refused reservation writes no outbox row.
func TestServiceReserveItem_Rules(t *testing.T) {
	available := func(worn bool) *ItemPlacement {
		return &ItemPlacement{Status: itemStatusAvailable, Location: LocationStash, Worn: worn}
	}
	inBag := func(worn bool) *ItemPlacement {
		return &ItemPlacement{Status: itemStatusAvailable, Location: LocationBag, Worn: worn}
	}
	dbDown := errors.New("connection refused")

	tests := []struct {
		name        string
		repo        *reserveRepo
		wantErr     error
		wantRefusal errcode.Code
		wantCalls   []string
	}{
		{name: "unknown or foreign instance is not found",
			repo: &reserveRepo{}, wantErr: commonconstants.ErrNotFound, wantCalls: []string{"lock", "read"}},
		{name: "worn is refused",
			repo: &reserveRepo{placement: available(true)}, wantRefusal: errcode.ItemWorn, wantCalls: []string{"lock", "read"}},
		{name: "listed is not available",
			repo: &reserveRepo{placement: &ItemPlacement{Status: "LISTED", Location: LocationBag}}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "pending settlement is not available",
			repo: &reserveRepo{placement: &ItemPlacement{Status: "PENDING_SETTLEMENT", Location: LocationBag}}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "worn and in a run is not available, not worn",
			repo: &reserveRepo{placement: &ItemPlacement{Status: itemStatusInRun, Location: LocationBag, Worn: true}}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "a bag item is not in the stash (FS-3R77D)",
			repo: &reserveRepo{placement: inBag(false)}, wantRefusal: errcode.ItemNotInStash, wantCalls: []string{"lock", "read"}},
		{name: "worn in the bag is still worn (FS-3R77D R4)",
			repo: &reserveRepo{placement: inBag(true)}, wantRefusal: errcode.ItemWorn, wantCalls: []string{"lock", "read"}},
		{name: "a bag item at the cap is not in the stash (FS-3R77D R4)",
			repo: &reserveRepo{placement: inBag(false), listed: MaxListedItems}, wantRefusal: errcode.ItemNotInStash, wantCalls: []string{"lock", "read"}},
		{name: "unworn and available is reserved",
			repo: &reserveRepo{placement: available(false)}, wantCalls: []string{"lock", "read", "count", "reserve"}},
		{name: "one under the cap is reserved",
			repo: &reserveRepo{placement: available(false), listed: MaxListedItems - 1}, wantCalls: []string{"lock", "read", "count", "reserve"}},
		{name: "at the cap is refused",
			repo: &reserveRepo{placement: available(false), listed: MaxListedItems}, wantRefusal: errcode.ListingLimitReached, wantCalls: []string{"lock", "read", "count"}},
		{name: "over the cap is refused",
			repo: &reserveRepo{placement: available(false), listed: MaxListedItems + 3}, wantRefusal: errcode.ListingLimitReached, wantCalls: []string{"lock", "read", "count"}},
		{name: "worn at the cap is still worn",
			repo: &reserveRepo{placement: available(true), listed: MaxListedItems}, wantRefusal: errcode.ItemWorn, wantCalls: []string{"lock", "read"}},
		{name: "listed at the cap is still not available",
			repo: &reserveRepo{placement: &ItemPlacement{Status: "LISTED", Location: LocationBag}, listed: MaxListedItems}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read"}},
		{name: "a count failure is returned, not read as a refusal",
			repo: &reserveRepo{placement: available(false), countErr: dbDown}, wantErr: dbDown, wantCalls: []string{"lock", "read", "count"}},
		{name: "a reserve that matches no row is not available",
			repo: &reserveRepo{placement: available(false), reserveErr: ErrItemNotReservable}, wantRefusal: errcode.ItemNotAvailable, wantCalls: []string{"lock", "read", "count", "reserve"}},
		{name: "a reserve failure is returned, not read as a refusal",
			repo: &reserveRepo{placement: available(false), reserveErr: dbDown}, wantErr: dbDown, wantCalls: []string{"lock", "read", "count", "reserve"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seller, itemID := uuid.New(), uuid.New()
			outbox := &recordingOutbox{}
			svc := &service{repo: tt.repo, withTx: runInline, outboxPublisher: outbox}

			item, err := svc.ReserveItem(context.Background(), seller, itemID, 100, nil, time.Now().Add(time.Hour))

			switch {
			case tt.wantRefusal != "":
				var refusal *errcode.Refusal
				if !errors.As(err, &refusal) || refusal.Code != tt.wantRefusal {
					t.Fatalf("err = %v, want refusal %s", err, tt.wantRefusal)
				}
			case tt.wantErr != nil:
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				var refusal *errcode.Refusal
				if errors.As(err, &refusal) {
					t.Fatalf("err = %v, must not read as a refusal", err)
				}
			default:
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if item.ID != itemID || item.Status != "LISTED" {
					t.Errorf("item = %+v, want %v LISTED", item, itemID)
				}
			}

			wantRows := 0
			if err == nil {
				wantRows = 1
			}
			if len(outbox.rows) != wantRows {
				t.Errorf("outbox rows = %d, want %d", len(outbox.rows), wantRows)
			}
			if got := strings.Join(tt.repo.calls, ","); got != strings.Join(tt.wantCalls, ",") {
				t.Errorf("calls = %v, want %v", tt.repo.calls, tt.wantCalls)
			}
			if tt.repo.lockedFor != seller || tt.repo.readFor != seller {
				t.Errorf("locked %v, read for %v; want the seller %v", tt.repo.lockedFor, tt.repo.readFor, seller)
			}
			if slices.Contains(tt.repo.calls, "count") && tt.repo.countFor != seller {
				t.Errorf("counted for %v, want the seller %v", tt.repo.countFor, seller)
			}
		})
	}
}

// refusedWith fails t unless err is the refusal code.
func refusedWith(t *testing.T, err error, code errcode.Code) {
	t.Helper()
	var refusal *errcode.Refusal
	if !errors.As(err, &refusal) || refusal.Code != code {
		t.Fatalf("err = %v, want refusal %s", err, code)
	}
}

// wearIn puts id in the slot column of owner's testCharacter.
func wearIn(t *testing.T, ctx context.Context, db *sqlx.DB, owner, id uuid.UUID, column string) {
	t.Helper()
	if _, err := db.ExecContext(ctx, `INSERT INTO player_loadouts (member_id, character_id, `+column+`) VALUES ($1, $2, $3)`, owner, testCharacter(owner), id); err != nil {
		t.Fatalf("wear in %s: %v", column, err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })
}

// Opt-in and committed. The reservation's checks against a real schema: a
// worn instance (a weapon slot and a consumable slot) is refused ITEM_WORN and
// left untouched; an unworn bag one is refused ITEM_NOT_IN_STASH and left
// untouched (FS-3R77D R2); an unworn stash one is reserved as before; a listed one, and one
// worn in a run, are not available; a missing and a foreign one read the same,
// not found (FS-HBXZN R1-R4). The outbox is recorded rather than written, so
// no ItemReserved for a test item can reach a live outbox worker.
func TestServiceReserveItem_AgainstTheSchema(t *testing.T) {
	ctx, db := catalogueDB(t)
	reserve := func(seller, itemID uuid.UUID) (*recordingOutbox, error) {
		outbox := &recordingOutbox{}
		_, err := NewService(NewRepository(db), db, nil, outbox, nil, everyCharacterOwned{}).ReserveItem(ctx, seller, itemID, 100, nil, time.Now().Add(time.Hour))
		return outbox, err
	}

	for _, column := range []string{"weapon_instance_id", "consumable_1_id"} {
		t.Run("worn in "+column+" is refused and untouched", func(t *testing.T) {
			owner := uuid.New()
			item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationBag)
			wearIn(t, ctx, db, owner, item, column)

			outbox, err := reserve(owner, item)

			refusedWith(t, err, errcode.ItemWorn)
			if r := reservationOf(t, ctx, db, item); r.Status != itemStatusAvailable || r.ListingID != nil || r.ReservedAt != nil {
				t.Errorf("item = %+v, want AVAILABLE with no listing", r)
			}
			if len(outbox.rows) != 0 {
				t.Errorf("outbox rows = %d, want none", len(outbox.rows))
			}
		})
	}

	t.Run("a bag item is refused and untouched (FS-3R77D R2)", func(t *testing.T) {
		owner := uuid.New()
		item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationBag)

		outbox, err := reserve(owner, item)

		refusedWith(t, err, errcode.ItemNotInStash)
		if r := reservationOf(t, ctx, db, item); r.Status != itemStatusAvailable || r.ListingID != nil || r.ReservedAt != nil {
			t.Errorf("item = %+v, want AVAILABLE with no listing", r)
		}
		if len(outbox.rows) != 0 {
			t.Errorf("outbox rows = %d, want none", len(outbox.rows))
		}
	})

	t.Run("unworn and available in the stash is reserved", func(t *testing.T) {
		owner := uuid.New()
		item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)

		outbox, err := reserve(owner, item)

		if err != nil {
			t.Fatalf("reserve: %v", err)
		}
		if r := reservationOf(t, ctx, db, item); r.Status != "LISTED" || r.ListingID == nil || r.ReservedAt == nil {
			t.Errorf("item = %+v, want LISTED with a listing and reserved_at", r)
		}
		if len(outbox.rows) != 1 || outbox.rows[0].RoutingKey != commonconstants.ItemReserved {
			t.Errorf("outbox rows = %+v, want one %s", outbox.rows, commonconstants.ItemReserved)
		}
	})

	t.Run("listed is not available", func(t *testing.T) {
		owner := uuid.New()
		item := seedAt(t, ctx, db, owner, "LISTED", LocationBag)

		_, err := reserve(owner, item)

		refusedWith(t, err, errcode.ItemNotAvailable)
	})

	t.Run("worn and in a run is not available, not worn", func(t *testing.T) {
		owner := uuid.New()
		item := seedInRun(t, ctx, db, owner, LocationBag, uuid.New())
		wearIn(t, ctx, db, owner, item, "weapon_instance_id")

		_, err := reserve(owner, item)

		refusedWith(t, err, errcode.ItemNotAvailable)
	})

	t.Run("missing and foreign are not found alike", func(t *testing.T) {
		owner := uuid.New()
		foreign := seedAt(t, ctx, db, uuid.New(), itemStatusAvailable, LocationBag)

		for name, item := range map[string]uuid.UUID{"missing": uuid.New(), "foreign": foreign} {
			_, err := reserve(owner, item)

			if !errors.Is(err, commonconstants.ErrNotFound) {
				t.Errorf("%s: err = %v, want not found", name, err)
			}
		}
		if r := reservationOf(t, ctx, db, foreign); r.Status != itemStatusAvailable || r.ListingID != nil {
			t.Errorf("foreign item = %+v, want untouched", r)
		}
	})
}

// seedListed gives owner n instances that count toward the listed-item cap,
// alternating LISTED and PENDING_SETTLEMENT.
func seedListed(t *testing.T, ctx context.Context, db *sqlx.DB, owner uuid.UUID, n int) {
	t.Helper()
	for i := range n {
		status := "LISTED"
		if i%2 == 1 {
			status = "PENDING_SETTLEMENT"
		}
		seedAt(t, ctx, db, owner, status, LocationStash)
	}
}

// Opt-in and committed. The listed-item cap against a real schema: with 19
// listed or settling the 20th reserve succeeds, and the 21st, counting the
// 20th's reservation not yet a listing, is refused LISTING_LIMIT_REACHED with
// nothing written. AVAILABLE and IN_RUN instances, and another member's
// listings, do not count; a worn or unavailable item at the cap answers its
// own code (FS-XEDFF R5, R6, R8).
func TestServiceReserveItem_ListedItemCap(t *testing.T) {
	ctx, db := catalogueDB(t)
	reserve := func(seller, itemID uuid.UUID) (*recordingOutbox, error) {
		outbox := &recordingOutbox{}
		_, err := NewService(NewRepository(db), db, nil, outbox, nil, everyCharacterOwned{}).ReserveItem(ctx, seller, itemID, 100, nil, time.Now().Add(time.Hour))
		return outbox, err
	}
	untouched := func(t *testing.T, item uuid.UUID) {
		t.Helper()
		if r := reservationOf(t, ctx, db, item); r.Status != itemStatusAvailable || r.ListingID != nil || r.ReservedAt != nil {
			t.Errorf("item = %+v, want AVAILABLE with no listing and no reserved_at", r)
		}
	}

	t.Run("the 20th is reserved and the 21st refused, writing nothing", func(t *testing.T) {
		owner := uuid.New()
		seedListed(t, ctx, db, owner, MaxListedItems-1)
		twentieth := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)
		twentyFirst := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)

		if _, err := reserve(owner, twentieth); err != nil {
			t.Fatalf("20th reserve: %v", err)
		}
		outbox, err := reserve(owner, twentyFirst)

		refusedWith(t, err, errcode.ListingLimitReached)
		untouched(t, twentyFirst)
		if len(outbox.rows) != 0 {
			t.Errorf("outbox rows = %d, want none", len(outbox.rows))
		}
	})

	t.Run("available, in-run and another member's items do not count", func(t *testing.T) {
		owner := uuid.New()
		seedListed(t, ctx, db, owner, MaxListedItems-1)
		for range 3 {
			seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)
			seedInRun(t, ctx, db, owner, LocationBag, uuid.New())
		}
		seedListed(t, ctx, db, uuid.New(), MaxListedItems)
		item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)

		if _, err := reserve(owner, item); err != nil {
			t.Fatalf("reserve at 19: %v", err)
		}
	})

	t.Run("at the cap a worn item is still worn and an unavailable one still unavailable", func(t *testing.T) {
		owner := uuid.New()
		seedListed(t, ctx, db, owner, MaxListedItems)
		worn := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationBag)
		wearIn(t, ctx, db, owner, worn, "weapon_instance_id")
		inRun := seedInRun(t, ctx, db, owner, LocationBag, uuid.New())

		_, err := reserve(owner, worn)
		refusedWith(t, err, errcode.ItemWorn)
		_, err = reserve(owner, inRun)
		refusedWith(t, err, errcode.ItemNotAvailable)
	})
}

// Opt-in and committed. Two reserves of different items for one seller at 19,
// run at once and repeated: the account lock orders the counts, so every run
// ends with exactly one reserved and the other refused LISTING_LIMIT_REACHED,
// never 21 listed (FS-XEDFF R6, §User Stories 5).
func TestServiceReserveItem_ConcurrentReservesAt19(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, &recordingOutbox{}, nil, everyCharacterOwned{})

	for i := range 10 {
		owner := uuid.New()
		seedListed(t, ctx, db, owner, MaxListedItems-1)
		items := []uuid.UUID{
			seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash),
			seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash),
		}

		errs := make(chan error, len(items))
		start := make(chan struct{})
		for _, id := range items {
			go func() {
				<-start
				_, err := svc.ReserveItem(ctx, owner, id, 100, nil, time.Now().Add(time.Hour))
				errs <- err
			}()
		}
		close(start)

		var ok, capped int
		for range items {
			err := <-errs
			var refusal *errcode.Refusal
			switch {
			case err == nil:
				ok++
			case errors.As(err, &refusal) && refusal.Code == errcode.ListingLimitReached:
				capped++
			default:
				t.Errorf("run %d: unexpected error: %v", i, err)
			}
		}
		if ok != 1 || capped != 1 {
			t.Fatalf("run %d: reserved %d, refused LISTING_LIMIT_REACHED %d; want 1 and 1", i, ok, capped)
		}

		var listed int
		if err := db.GetContext(ctx, &listed, `SELECT COUNT(*) FROM item_instances WHERE owner_member_id = $1 AND status IN ('LISTED', 'PENDING_SETTLEMENT')`, owner); err != nil {
			t.Fatalf("run %d: count: %v", i, err)
		}
		if listed != MaxListedItems {
			t.Fatalf("run %d: listed = %d, want %d", i, listed, MaxListedItems)
		}
	}
}

// midEquipRepo starts a reservation of the item being equipped after the
// equip has written the loadout and before it commits, and lets the equip
// commit only once the reservation is seen waiting: the window a reserve
// without the account lock would read "not worn" in and then win the item row
// once the equip commits.
type midEquipRepo struct {
	*repository
	reserve func() (<-chan error, error)
	result  <-chan error
}

func (r *midEquipRepo) UpsertLoadoutSlotTx(ctx context.Context, tx *sqlx.Tx, req *UpdateLoadoutRequest) error {
	if err := r.repository.UpsertLoadoutSlotTx(ctx, tx, req); err != nil {
		return err
	}
	result, err := r.reserve()
	r.result = result
	return err
}

// awaitAccountLockWaiter returns once another session is blocked on member's
// account lock, and fails if done reports first or nothing waits in time.
func awaitAccountLockWaiter(ctx context.Context, db *sqlx.DB, member uuid.UUID, done <-chan error) error {
	const waiter = `
		SELECT EXISTS (
			SELECT 1 FROM pg_locks
			WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
			AND ((classid::bigint << 32) | objid::bigint) = hashtextextended('items.account:' || $1::text, 0)
		)`
	deadline := time.After(5 * time.Second)
	for {
		var waiting bool
		if err := db.GetContext(ctx, &waiting, waiter, member); err != nil {
			return fmt.Errorf("read lock waiters: %w", err)
		}
		if waiting {
			return nil
		}
		select {
		case err := <-done:
			return fmt.Errorf("reserve finished without waiting on the account lock: %v", err)
		case <-deadline:
			return errors.New("reserve never waited on the account lock")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

// Opt-in and committed. A reservation that starts while an equip of the same
// item is uncommitted waits for it behind the seller's account lock and then
// sees the item worn (FS-HBXZN R3).
func TestServiceReserveItem_WaitsForAnEquipInProgress(t *testing.T) {
	ctx, db := catalogueDB(t)
	owner := uuid.New()
	item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationBag)
	t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })

	reserver := NewService(NewRepository(db), db, nil, &recordingOutbox{}, nil, everyCharacterOwned{})
	repo := &midEquipRepo{repository: NewRepository(db), reserve: func() (<-chan error, error) {
		done := make(chan error, 1)
		go func() {
			_, err := reserver.ReserveItem(ctx, owner, item, 100, nil, time.Now().Add(time.Hour))
			done <- err
		}()
		return done, awaitAccountLockWaiter(ctx, db, owner, done)
	}}

	if err := NewService(repo, db, nil, nil, nil, everyCharacterOwned{}).UpdateLoadout(ctx, owner, &UpdateLoadoutRequest{MemberId: owner, CharacterId: testCharacter(owner), Slot: "weapon", ItemInstanceId: &item}); err != nil {
		t.Fatalf("equip: %v", err)
	}
	if repo.result == nil {
		t.Fatal("the equip never wrote the loadout slot, so no reservation was started")
	}

	var err error
	select {
	case err = <-repo.result:
	case <-time.After(5 * time.Second):
		t.Fatal("reserve did not finish within 5s of the equip committing")
	}
	var refusal *errcode.Refusal
	if !errors.As(err, &refusal) || refusal.Code != errcode.ItemWorn {
		t.Fatalf("reserve = %v, want ITEM_WORN", err)
	}
	if r := reservationOf(t, ctx, db, item); r.Status != itemStatusAvailable || r.ListingID != nil {
		t.Errorf("item = %+v, want AVAILABLE with no listing", r)
	}
}

// Opt-in and committed. An equip and a reservation of the same instance, run
// at once and repeated: both take the seller's account lock, so every run ends
// with exactly one of them succeeding, and the instance is never both worn and
// LISTED (FS-HBXZN R3, §Edge States "Equip and list race").
func TestServiceReserveItem_RacingAnEquip(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, &recordingOutbox{}, nil, everyCharacterOwned{})

	for i := range 25 {
		owner := uuid.New()
		// in the stash, so a reserve that wins is a reservation (FS-3R77D R2);
		// equipping from the stash is allowed (FS-VPD8Y R19)
		item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)
		t.Cleanup(func() { _, _ = db.ExecContext(ctx, `DELETE FROM player_loadouts WHERE member_id = $1`, owner) })

		start := make(chan struct{})
		equipped, reserved := make(chan error, 1), make(chan error, 1)
		go func() {
			<-start
			equipped <- svc.UpdateLoadout(ctx, owner, &UpdateLoadoutRequest{MemberId: owner, CharacterId: testCharacter(owner), Slot: "weapon", ItemInstanceId: &item})
		}()
		go func() {
			<-start
			_, err := svc.ReserveItem(ctx, owner, item, 100, nil, time.Now().Add(time.Hour))
			reserved <- err
		}()
		close(start)
		equipErr, reserveErr := <-equipped, <-reserved

		var refusal *errcode.Refusal
		switch {
		case equipErr == nil && reserveErr == nil:
			t.Fatalf("run %d: both the equip and the reservation succeeded", i)
		case equipErr == nil:
			if !errors.As(reserveErr, &refusal) || refusal.Code != errcode.ItemWorn {
				t.Fatalf("run %d: equip won, reserve = %v, want ITEM_WORN", i, reserveErr)
			}
		case reserveErr == nil:
			if !errors.As(equipErr, &refusal) || refusal.Code != errcode.ItemNotAvailable {
				t.Fatalf("run %d: reserve won, equip = %v, want ITEM_NOT_AVAILABLE", i, equipErr)
			}
		default:
			t.Fatalf("run %d: neither succeeded: equip = %v, reserve = %v", i, equipErr, reserveErr)
		}

		placement := &ItemPlacement{}
		if err := db.GetContext(ctx, placement, placementQuery, item, owner); err != nil {
			t.Fatalf("run %d: read back: %v", i, err)
		}
		if placement.Worn && placement.Status == "LISTED" {
			t.Fatalf("run %d: item is both worn and LISTED", i)
		}
	}
}

// Opt-in and committed. A move of a stash item to the bag and a reservation of
// the same item, run at once and repeated: both take the seller's account lock,
// so every run ends with exactly one of them succeeding. Move first, the
// reserve reads the bag and is refused ITEM_NOT_IN_STASH; reserve first, the
// move reads LISTED and is refused ITEM_NOT_AVAILABLE. A bag item is never
// LISTED, with no location predicate in the reserve's UPDATE (FS-3R77D R5,
// §Edge States "Move and list race").
func TestServiceReserveItem_RacingAMoveToTheBag(t *testing.T) {
	ctx, db := catalogueDB(t)
	svc := NewService(NewRepository(db), db, nil, &recordingOutbox{}, nil, everyCharacterOwned{})

	for i := range 25 {
		owner := uuid.New()
		item := seedAt(t, ctx, db, owner, itemStatusAvailable, LocationStash)

		start := make(chan struct{})
		moved, reserved := make(chan error, 1), make(chan error, 1)
		go func() {
			<-start
			_, err := svc.MoveItemInstance(ctx, owner, &MoveItemInstanceRequest{ItemInstanceID: item, Location: LocationBag, CharacterID: testCharacter(owner)})
			moved <- err
		}()
		go func() {
			<-start
			_, err := svc.ReserveItem(ctx, owner, item, 100, nil, time.Now().Add(time.Hour))
			reserved <- err
		}()
		close(start)
		moveErr, reserveErr := <-moved, <-reserved

		var refusal *errcode.Refusal
		switch {
		case moveErr == nil && reserveErr == nil:
			t.Fatalf("run %d: both the move and the reservation succeeded", i)
		case moveErr == nil:
			if !errors.As(reserveErr, &refusal) || refusal.Code != errcode.ItemNotInStash {
				t.Fatalf("run %d: move won, reserve = %v, want ITEM_NOT_IN_STASH", i, reserveErr)
			}
		case reserveErr == nil:
			if !errors.As(moveErr, &refusal) || refusal.Code != errcode.ItemNotAvailable {
				t.Fatalf("run %d: reserve won, move = %v, want ITEM_NOT_AVAILABLE", i, moveErr)
			}
		default:
			t.Fatalf("run %d: neither succeeded: move = %v, reserve = %v", i, moveErr, reserveErr)
		}

		placement := &ItemPlacement{}
		if err := db.GetContext(ctx, placement, placementQuery, item, owner); err != nil {
			t.Fatalf("run %d: read back: %v", i, err)
		}
		if placement.Location == LocationBag && placement.Status == "LISTED" {
			t.Fatalf("run %d: item is LISTED in the bag", i)
		}
	}
}

// confirmedListRepo stubs the one repository call ListConfirmedReservations
// makes and records what it was asked for.
type confirmedListRepo struct {
	Repository
	rows []ConfirmedReservation
	err  error

	gotOlderThan time.Duration
	gotAfter     *cursor.UpdatedAt
	gotLimit     int
}

func (r *confirmedListRepo) ListConfirmedReservations(_ context.Context, olderThan time.Duration, after *cursor.UpdatedAt, limit int) ([]ConfirmedReservation, error) {
	r.gotOlderThan, r.gotAfter, r.gotLimit = olderThan, after, limit
	if r.err != nil {
		return nil, r.err
	}
	if len(r.rows) > limit {
		return r.rows[:limit], nil
	}
	return r.rows, nil
}

func confirmedRows(n int) []ConfirmedReservation {
	rows := make([]ConfirmedReservation, n)
	for i := range rows {
		rows[i] = ConfirmedReservation{ItemID: uuid.New(), ListingID: uuid.New(), UpdatedAt: time.Date(2026, 1, 1, i, 0, 0, 0, time.UTC)}
	}
	return rows
}

// A page holds at most 100 confirmed reservations (FS-04ZB6 Req 5): a missing,
// non-positive or larger limit is clamped to that. Next is the position of the
// page's last entry only while more follow, so the caller stops on an empty one.
func TestServiceListConfirmedReservations_ClampsAndPositionsTheNextPage(t *testing.T) {
	tests := []struct {
		name      string
		limit     int
		stored    int
		wantLimit int
		wantRows  int
		wantNext  bool
	}{
		{name: "no limit is the cap", limit: 0, stored: 3, wantLimit: 100, wantRows: 3},
		{name: "negative limit is the cap", limit: -1, stored: 3, wantLimit: 100, wantRows: 3},
		{name: "over the cap is the cap", limit: 500, stored: 150, wantLimit: 100, wantRows: 100, wantNext: true},
		{name: "a full page with more after it", limit: 2, stored: 3, wantLimit: 2, wantRows: 2, wantNext: true},
		{name: "exactly the last page", limit: 3, stored: 3, wantLimit: 3, wantRows: 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stored := confirmedRows(tt.stored)
			repo := &confirmedListRepo{rows: stored}
			after := &cursor.UpdatedAt{ID: uuid.New(), UpdatedAt: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}

			page, err := NewService(repo, nil, nil, nil, nil, everyCharacterOwned{}).ListConfirmedReservations(context.Background(), 10*time.Minute, after, tt.limit)

			if err != nil {
				t.Fatalf("ListConfirmedReservations: %v", err)
			}
			if repo.gotOlderThan != 10*time.Minute || repo.gotAfter != after {
				t.Errorf("repo asked for olderThan %v after %v, want 10m after %v", repo.gotOlderThan, repo.gotAfter, after)
			}
			if len(page.Reservations) != tt.wantRows {
				t.Fatalf("page of %d, want %d (limit %d)", len(page.Reservations), tt.wantRows, tt.wantLimit)
			}
			if !tt.wantNext {
				if page.Next != nil {
					t.Errorf("next = %+v, want none on the last page", page.Next)
				}
				return
			}
			last := page.Reservations[len(page.Reservations)-1]
			if page.Next == nil || page.Next.ID != last.ItemID || !page.Next.UpdatedAt.Equal(last.UpdatedAt) {
				t.Errorf("next = %+v, want the position of the last entry %s at %s", page.Next, last.ItemID, last.UpdatedAt)
			}
		})
	}
}

func TestServiceListConfirmedReservations_WrapsARepositoryFailure(t *testing.T) {
	dbDown := errors.New("connection refused")

	_, err := NewService(&confirmedListRepo{err: dbDown}, nil, nil, nil, nil, everyCharacterOwned{}).ListConfirmedReservations(context.Background(), 10*time.Minute, nil, 10)

	if !errors.Is(err, dbDown) {
		t.Errorf("err = %v, want it to wrap %v", err, dbDown)
	}
}

// staleListRepo stubs the one repository call ListStaleReserved makes and
// records what it was asked for.
type staleListRepo struct {
	Repository
	rows []StaleReservation
	err  error

	gotOlderThan time.Duration
	gotAfter     *cursor.ReservedAt
	gotLimit     int
}

func (r *staleListRepo) ListStaleReserved(_ context.Context, olderThan time.Duration, after *cursor.ReservedAt, limit int) ([]StaleReservation, error) {
	r.gotOlderThan, r.gotAfter, r.gotLimit = olderThan, after, limit
	if r.err != nil {
		return nil, r.err
	}
	if len(r.rows) > limit {
		return r.rows[:limit], nil
	}
	return r.rows, nil
}

// A page holds at most 100 stale reservations (FS-9BJCP Req 1): a missing,
// non-positive or larger limit is the cap. One row past the page is read, and
// next is the position of the page's last entry only while more follow (Req 2).
func TestServiceListStaleReserved_ClampsAndPositionsTheNextPage(t *testing.T) {
	tests := []struct {
		name      string
		limit     int
		stored    int
		wantLimit int
		wantRows  int
		wantNext  bool
	}{
		{name: "no limit is the cap", limit: 0, stored: 3, wantLimit: 100, wantRows: 3},
		{name: "negative limit is the cap", limit: -1, stored: 3, wantLimit: 100, wantRows: 3},
		{name: "over the cap is the cap", limit: 500, stored: 150, wantLimit: 100, wantRows: 100, wantNext: true},
		{name: "a full page with more after it", limit: 2, stored: 3, wantLimit: 2, wantRows: 2, wantNext: true},
		{name: "exactly the last page", limit: 3, stored: 3, wantLimit: 3, wantRows: 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stored := make([]StaleReservation, tt.stored)
			for i := range stored {
				stored[i] = StaleReservation{ItemID: uuid.New(), ListingID: uuid.New(), ReservedAt: time.Date(2026, 1, 1, i, 0, 0, 0, time.UTC)}
			}
			repo := &staleListRepo{rows: stored}
			after := &cursor.ReservedAt{ID: uuid.New(), ReservedAt: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}

			page, err := NewService(repo, nil, nil, nil, nil, everyCharacterOwned{}).ListStaleReserved(context.Background(), 10*time.Minute, after, tt.limit)

			if err != nil {
				t.Fatalf("ListStaleReserved: %v", err)
			}
			if repo.gotOlderThan != 10*time.Minute || repo.gotAfter != after || repo.gotLimit != tt.wantLimit+1 {
				t.Errorf("repo asked for olderThan %v after %v limit %d, want 10m after %v limit %d", repo.gotOlderThan, repo.gotAfter, repo.gotLimit, after, tt.wantLimit+1)
			}
			if len(page.Reservations) != tt.wantRows {
				t.Fatalf("page of %d, want %d (limit %d)", len(page.Reservations), tt.wantRows, tt.wantLimit)
			}
			if !tt.wantNext {
				if page.Next != nil {
					t.Errorf("next = %+v, want none on the last page", page.Next)
				}
				return
			}
			last := page.Reservations[len(page.Reservations)-1]
			if page.Next == nil || page.Next.ID != last.ItemID || !page.Next.ReservedAt.Equal(last.ReservedAt) {
				t.Errorf("next = %+v, want the position of the last entry %s at %s", page.Next, last.ItemID, last.ReservedAt)
			}
		})
	}
}

func TestServiceListStaleReserved_WrapsARepositoryFailure(t *testing.T) {
	dbDown := errors.New("connection refused")

	_, err := NewService(&staleListRepo{err: dbDown}, nil, nil, nil, nil, everyCharacterOwned{}).ListStaleReserved(context.Background(), 10*time.Minute, nil, 10)

	if !errors.Is(err, dbDown) {
		t.Errorf("err = %v, want it to wrap %v", err, dbDown)
	}
}
