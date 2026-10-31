package items

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
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

			got, err := NewService(repo, nil, nil, nil, nil).GetLoadoutWithItems(context.Background(), owner, &GetLoadoutRequest{MemberId: owner})

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

func (r *moveRepo) MoveItemInstanceTx(_ context.Context, _ *sqlx.Tx, owner, _ uuid.UUID, location string) (bool, error) {
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
			svc := &service{repo: tt.repo, withTx: runInline}

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

	calls      []string
	lockedFor  uuid.UUID
	equipped   *UpdateLoadoutRequest
	relocated  uuid.UUID
	relocateTo string
}

func (r *loadoutWriteRepo) LockAccountTx(_ context.Context, _ *sqlx.Tx, member uuid.UUID) error {
	r.calls = append(r.calls, "lock")
	r.lockedFor = member
	return nil
}

func (r *loadoutWriteRepo) LoadoutSlotTx(_ context.Context, _ *sqlx.Tx, _ uuid.UUID, _ string) (*uuid.UUID, error) {
	r.calls = append(r.calls, "slot")
	return r.worn, nil
}

func (r *loadoutWriteRepo) LockItemPlacementTx(_ context.Context, _ *sqlx.Tx, _, _ uuid.UUID) (*ItemPlacement, error) {
	r.calls = append(r.calls, "read")
	return r.placement, nil
}

func (r *loadoutWriteRepo) CountUnwornAtTx(_ context.Context, _ *sqlx.Tx, _ uuid.UUID, location string) (int, error) {
	r.calls = append(r.calls, "count:"+location)
	return r.bagCount, r.countErr
}

func (r *loadoutWriteRepo) UpsertLoadoutSlotTx(_ context.Context, _ *sqlx.Tx, req *UpdateLoadoutRequest) error {
	r.calls = append(r.calls, "equip")
	r.equipped = req
	return nil
}

func (r *loadoutWriteRepo) SetLocationTx(_ context.Context, _ *sqlx.Tx, _, itemID uuid.UUID, location string) error {
	r.calls = append(r.calls, "relocate")
	r.relocated, r.relocateTo = itemID, location
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
			wantCalls: []string{"lock", "slot", "count:BAG", "equip", "relocate"}, wantToTheBag: true},
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
			wantCalls: []string{"lock", "slot", "read", "equip", "relocate"}, wantToTheBag: true},
		{name: "a stash-item swap under the cap sends the displaced item to the bag", equip: &equip,
			repo:      &loadoutWriteRepo{worn: &worn, placement: fromStash, bagCount: 4},
			wantCalls: []string{"lock", "slot", "read", "count:BAG", "equip", "relocate"}, wantToTheBag: true},
		{name: "a stash-item swap into a bag of 30 grows it and is refused", equip: &equip,
			repo:        &loadoutWriteRepo{worn: &worn, placement: fromStash, bagCount: BagCapacity},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "slot", "read", "count:BAG"}},
		{name: "swapping in an item worn in another slot grows the bag", equip: &equip,
			repo:        &loadoutWriteRepo{worn: &worn, placement: &ItemPlacement{Status: "AVAILABLE", Location: LocationBag, Worn: true}, bagCount: BagCapacity},
			wantRefusal: errcode.BagFull, wantCalls: []string{"lock", "slot", "read", "count:BAG"}},
		{name: "equip into an empty slot at 30 always passes", equip: &equip,
			repo:      &loadoutWriteRepo{placement: fromBag, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip"}},
		{name: "equip from the stash into an empty slot is not refused", equip: &equip,
			repo:      &loadoutWriteRepo{placement: fromStash, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip"}},
		{name: "re-equipping the worn item displaces nothing", equip: &worn,
			repo:      &loadoutWriteRepo{worn: &worn, bagCount: BagCapacity},
			wantCalls: []string{"lock", "slot", "read", "equip"}},
		{name: "a count failure is returned, not read as a refusal", equip: nil,
			repo:    &loadoutWriteRepo{worn: &worn, countErr: dbDown},
			wantErr: dbDown, wantCalls: []string{"lock", "slot", "count:BAG"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller := uuid.New()
			svc := &service{repo: tt.repo, withTx: runInline}
			req := &UpdateLoadoutRequest{MemberId: caller, Slot: "weapon", ItemInstanceId: tt.equip}

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
			if tt.wantToTheBag && (tt.repo.relocated != worn || tt.repo.relocateTo != LocationBag) {
				t.Errorf("relocated (%v, %q), want the slot's instance (%v) to %q", tt.repo.relocated, tt.repo.relocateTo, worn, LocationBag)
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
			wantCalls: []string{"lock", "slot", "read", "equip"}},
		{name: "clearing a slot whatever its item is not checked", status: itemStatusInRun, worn: &worn,
			wantCalls: []string{"lock", "slot", "count:BAG", "equip", "relocate"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller := uuid.New()
			repo := &loadoutWriteRepo{worn: tt.worn, placement: &ItemPlacement{Status: tt.status, Location: LocationBag}}
			svc := &service{repo: repo, withTx: runInline}

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
