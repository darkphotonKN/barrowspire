package items

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/durationpb"
)

// fakeListService serves ListItemInstances only; any other call panics on the
// nil embedded interface, so the handler cannot quietly reach for anything else.
type fakeListService struct {
	Service
	items []*ItemInstance
}

func (f *fakeListService) ListItemInstances(context.Context, uuid.UUID, *ListItemInstancesRequest) ([]*ItemInstance, error) {
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
		{"relic checked out into a run is in run (FS-18Z5F R4)", "IN_RUN"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeListService{items: []*ItemInstance{{
				ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: uuid.New(),
				Source: "extracted", ItemType: "weapon", Name: "Blade", Status: tt.status,
			}}}
			h := NewHandler(svc, nil)

			owner := uuid.New()
			ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner})
			res, err := h.ListItemInstances(ctx, &pb.ListItemInstancesRequest{MemberId: owner.String()})
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

func (f *fakeLoadoutService) GetLoadoutWithItems(context.Context, uuid.UUID, *GetLoadoutRequest) (*LoadoutWithItems, error) {
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
		owner := uuid.New()
		ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner})
		res, err := h.ListItemInstances(ctx, &pb.ListItemInstancesRequest{MemberId: owner.String()})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got := res.Items[0].RequiredLevel; got != 7 {
			t.Errorf("RequiredLevel = %d, want 7", got)
		}
	})

	t.Run("GetLoadoutWithItems", func(t *testing.T) {
		h := NewHandler(&fakeLoadoutService{loadout: &LoadoutWithItems{Weapon: instance(7), Ring1: instance(3)}}, nil)
		owner := uuid.New()
		ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner})
		res, err := h.GetLoadoutWithItems(ctx, &pb.GetLoadoutWithItemsRequest{MemberId: owner.String(), CharacterId: uuid.NewString()})
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

// FS-50MTX R24: the holder goes on the wire, empty for a stash item.
func TestItemInstanceToProto_CarriesHolder(t *testing.T) {
	character := uuid.New()

	if got := itemInstanceToProto(&ItemInstance{ID: uuid.New(), Location: LocationBag, CharacterID: &character}).CharacterId; got != character.String() {
		t.Errorf("held item: CharacterId = %q, want %q", got, character)
	}
	if got := itemInstanceToProto(&ItemInstance{ID: uuid.New(), Location: LocationStash}).CharacterId; got != "" {
		t.Errorf("stash item: CharacterId = %q, want empty", got)
	}
}

// gearReadService records what each gear read was asked for; any other call
// panics on the nil embedded interface.
type gearReadService struct {
	Service
	calls      int
	gotLoadout *GetLoadoutRequest
	gotList    *ListItemInstancesRequest
	gotGear    *CheckOutRunGearRequest
}

func (f *gearReadService) GetLoadout(_ context.Context, _ uuid.UUID, req *GetLoadoutRequest) (*Loadout, error) {
	f.calls, f.gotLoadout = f.calls+1, req
	return &Loadout{}, nil
}

func (f *gearReadService) GetLoadoutWithItems(_ context.Context, _ uuid.UUID, req *GetLoadoutRequest) (*LoadoutWithItems, error) {
	f.calls, f.gotLoadout = f.calls+1, req
	return &LoadoutWithItems{}, nil
}

func (f *gearReadService) ListItemInstances(_ context.Context, _ uuid.UUID, req *ListItemInstancesRequest) ([]*ItemInstance, error) {
	f.calls, f.gotList = f.calls+1, req
	return nil, nil
}

func (f *gearReadService) CheckOutRunGear(_ context.Context, _ uuid.UUID, req *CheckOutRunGearRequest) (*RunGear, error) {
	f.calls, f.gotGear = f.calls+1, req
	return &RunGear{Loadout: &LoadoutWithItems{}}, nil
}

// FS-50MTX R22, R25: the loadout reads and the checkout need a character; a
// missing or malformed one is InvalidArgument and reaches nothing, which
// game-service's empty id for a seat with no character relies on. A good one
// goes to the service. The nil uuid is an unknown character to a read, but is
// still refused at checkout, which has no ownership check behind it (R27).
func TestHandler_GearReads_NeedACharacter(t *testing.T) {
	member := uuid.New()
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: member})
	rpcs := []struct {
		name string
		call func(h *Handler, character string) error
		got  func(f *gearReadService) uuid.UUID
		// nilCode is what the nil uuid answers
		nilCode codes.Code
	}{
		{"GetLoadout", func(h *Handler, character string) error {
			_, err := h.GetLoadout(ctx, &pb.GetLoadoutRequest{MemberId: member.String(), CharacterId: character})
			return err
		}, func(f *gearReadService) uuid.UUID { return f.gotLoadout.CharacterId }, codes.OK},
		{"GetLoadoutWithItems", func(h *Handler, character string) error {
			_, err := h.GetLoadoutWithItems(ctx, &pb.GetLoadoutWithItemsRequest{MemberId: member.String(), CharacterId: character})
			return err
		}, func(f *gearReadService) uuid.UUID { return f.gotLoadout.CharacterId }, codes.OK},
		{"CheckOutRunGear", func(h *Handler, character string) error {
			_, err := h.CheckOutRunGear(ctx, &pb.CheckOutRunGearRequest{MemberId: member.String(), RunId: uuid.NewString(), CharacterId: character})
			return err
		}, func(f *gearReadService) uuid.UUID { return f.gotGear.CharacterID }, codes.InvalidArgument},
	}
	for _, rpc := range rpcs {
		t.Run(rpc.name+"/the nil uuid", func(t *testing.T) {
			svc := &gearReadService{}

			err := rpc.call(NewHandler(svc, nil), uuid.Nil.String())

			if got := status.Code(err); got != rpc.nilCode {
				t.Fatalf("code = %v, want %v (err %v)", got, rpc.nilCode, err)
			}
			if rpc.nilCode != codes.OK {
				if svc.calls != 0 {
					t.Errorf("service called %d times, want none", svc.calls)
				}
				return
			}
			if got := rpc.got(svc); got != uuid.Nil {
				t.Errorf("service got character %v, want the nil uuid", got)
			}
		})

		for name, bad := range map[string]string{"missing": "", "malformed": "nope"} {
			t.Run(rpc.name+"/"+name+" character is refused", func(t *testing.T) {
				svc := &gearReadService{}

				err := rpc.call(NewHandler(svc, nil), bad)

				if got := status.Code(err); got != codes.InvalidArgument {
					t.Fatalf("code = %v, want InvalidArgument (err %v)", got, err)
				}
				if svc.calls != 0 {
					t.Errorf("service called %d times, want none", svc.calls)
				}
			})
		}

		t.Run(rpc.name+"/the character reaches the service", func(t *testing.T) {
			svc := &gearReadService{}
			character := uuid.New()

			if err := rpc.call(NewHandler(svc, nil), character.String()); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got := rpc.got(svc); got != character {
				t.Errorf("service got character %v, want %v", got, character)
			}
		})
	}
}

// FS-50MTX R23: the list's character is optional. Absent is the stash, a good
// one reaches the service, and only a malformed one is refused.
func TestHandler_ListItemInstances_TakesAnOptionalCharacter(t *testing.T) {
	member, character, unknown := uuid.New(), uuid.New(), uuid.Nil
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: member})
	tests := []struct {
		name     string
		raw      string
		want     *uuid.UUID
		wantCode codes.Code
	}{
		{name: "absent lists with no character", raw: "", want: nil, wantCode: codes.OK},
		{name: "a character is passed on", raw: character.String(), want: &character, wantCode: codes.OK},
		{name: "malformed is refused", raw: "nope", wantCode: codes.InvalidArgument},
		{name: "the nil uuid is an unknown character", raw: uuid.Nil.String(), want: &unknown, wantCode: codes.OK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &gearReadService{}

			_, err := NewHandler(svc, nil).ListItemInstances(ctx, &pb.ListItemInstancesRequest{MemberId: member.String(), CharacterId: tt.raw})

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
			}
			if tt.wantCode != codes.OK {
				if svc.calls != 0 {
					t.Errorf("service called %d times, want none", svc.calls)
				}
				return
			}
			if got := svc.gotList.CharacterId; (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Errorf("service got character %v, want %v", got, tt.want)
			}
		})
	}
}

// FS-VPD8Y R14: the stored location goes on the wire in the HTTP vocabulary,
// lowercase.
func TestItemInstanceToProto_CarriesLocationLowercase(t *testing.T) {
	tests := []struct {
		name     string
		location string
		want     string
	}{
		{name: "bag", location: LocationBag, want: "bag"},
		{name: "stash", location: LocationStash, want: "stash"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := itemInstanceToProto(&ItemInstance{ID: uuid.New(), Location: tt.location})

			if got.Location != tt.want {
				t.Errorf("Location = %q, want %q", got.Location, tt.want)
			}
		})
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
			h := NewHandler(NewService(repo, nil, nil, nil, nil, everyCharacterOwned{}), nil)

			res, err := h.GetLoadoutWithItems(tt.ctx, &pb.GetLoadoutWithItemsRequest{MemberId: owner.String(), CharacterId: uuid.NewString()})

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

// stashRepo holds one member's stash and loadout and counts every read and
// write, so a refused caller can be shown to reach no data at all.
type stashRepo struct {
	Repository
	owner  uuid.UUID
	reads  int
	writes int
}

func (r *stashRepo) GetLoadout(context.Context, *GetLoadoutRequest) (*Loadout, error) {
	r.reads++
	return &Loadout{MemberId: &r.owner}, nil
}

func (r *stashRepo) GetItemInstanceByID(context.Context, uuid.UUID) (*ItemInstance, error) {
	r.reads++
	return nil, nil
}

func (r *stashRepo) ListItemInstances(context.Context, *ListItemInstancesRequest) ([]*ItemInstance, error) {
	r.reads++
	return []*ItemInstance{{ID: uuid.New(), TemplateID: uuid.New(), OwnerMemberID: r.owner, ItemType: "weapon", Name: "Blade"}}, nil
}

func (r *stashRepo) LockAccountTx(context.Context, *sqlx.Tx, uuid.UUID) error {
	r.writes++
	return nil
}

func (r *stashRepo) LoadoutSlotTx(context.Context, *sqlx.Tx, uuid.UUID, uuid.UUID, string) (*uuid.UUID, error) {
	r.reads++
	return nil, nil
}

func (r *stashRepo) LockItemPlacementTx(context.Context, *sqlx.Tx, uuid.UUID, uuid.UUID) (*ItemPlacement, error) {
	r.reads++
	return &ItemPlacement{Status: itemStatusAvailable, Location: LocationBag}, nil
}

func (r *stashRepo) HoldInBagTx(context.Context, *sqlx.Tx, uuid.UUID, uuid.UUID, uuid.UUID) error {
	r.writes++
	return nil
}

func (r *stashRepo) UpsertLoadoutSlotTx(context.Context, *sqlx.Tx, *UpdateLoadoutRequest) error {
	r.writes++
	return nil
}

func (r *stashRepo) LoadoutTx(context.Context, *sqlx.Tx, uuid.UUID, uuid.UUID) (*Loadout, error) {
	r.reads++
	return &Loadout{MemberId: &r.owner}, nil
}

func (r *stashRepo) CheckOutRunGearTx(context.Context, *sqlx.Tx, uuid.UUID, uuid.UUID, uuid.UUID) ([]*ItemInstance, error) {
	r.writes++
	return nil, nil
}

// stashService serves repo with its transactions run inline, no database.
func stashService(repo *stashRepo) *service {
	svc := NewService(repo, nil, nil, nil, nil, everyCharacterOwned{})
	svc.withTx = runInline
	return svc
}

// ownedRPCs calls each stash/loadout RPC for the given member.
var ownedRPCs = []struct {
	name string
	call func(h *Handler, ctx context.Context, member string) error
}{
	{"GetLoadout", func(h *Handler, ctx context.Context, member string) error {
		_, err := h.GetLoadout(ctx, &pb.GetLoadoutRequest{MemberId: member, CharacterId: uuid.NewString()})
		return err
	}},
	{"GetLoadoutWithItems", func(h *Handler, ctx context.Context, member string) error {
		_, err := h.GetLoadoutWithItems(ctx, &pb.GetLoadoutWithItemsRequest{MemberId: member, CharacterId: uuid.NewString()})
		return err
	}},
	{"ListItemInstances", func(h *Handler, ctx context.Context, member string) error {
		_, err := h.ListItemInstances(ctx, &pb.ListItemInstancesRequest{MemberId: member})
		return err
	}},
	{"UpdateLoadout", func(h *Handler, ctx context.Context, member string) error {
		_, err := h.UpdateLoadout(ctx, &pb.UpdateLoadoutRequest{MemberId: member, CharacterId: uuid.NewString(), Slot: "weapon", ItemInstanceId: uuid.NewString()})
		return err
	}},
	{"CheckOutRunGear", func(h *Handler, ctx context.Context, member string) error {
		_, err := h.CheckOutRunGear(ctx, &pb.CheckOutRunGearRequest{MemberId: member, CharacterId: uuid.NewString(), RunId: uuid.NewString()})
		return err
	}},
}

// FS-4R9M9 R53: a member reads and changes only their own stash and loadout.
func TestHandler_StashAndLoadout_OnlyTheOwnerReachesThem(t *testing.T) {
	owner := uuid.New()
	asMember := func(id uuid.UUID) context.Context {
		return commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: id})
	}
	cases := []struct {
		name     string
		ctx      context.Context
		wantCode codes.Code
	}{
		{"own", asMember(owner), codes.OK},
		{"another member", asMember(uuid.New()), codes.PermissionDenied},
		{"no caller", context.Background(), codes.Unauthenticated},
	}
	for _, rpc := range ownedRPCs {
		for _, tt := range cases {
			t.Run(rpc.name+"/"+tt.name, func(t *testing.T) {
				repo := &stashRepo{owner: owner}
				h := NewHandler(stashService(repo), nil)

				err := rpc.call(h, tt.ctx, owner.String())

				if got := status.Code(err); got != tt.wantCode {
					t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
				}
				if tt.wantCode != codes.OK && repo.reads+repo.writes != 0 {
					t.Errorf("refused caller reached the repository: %d reads, %d writes", repo.reads, repo.writes)
				}
			})
		}
	}
}

// warnCounter counts the Warn records logged through slog's default logger.
type warnCounter struct {
	slog.Handler
	warns *[]slog.Record
}

func (w warnCounter) Enabled(context.Context, slog.Level) bool { return true }

func (w warnCounter) Handle(_ context.Context, r slog.Record) error {
	if r.Level == slog.LevelWarn {
		*w.warns = append(*w.warns, r)
	}
	return nil
}

// FS-4R9M9 R53: every refused ownership attempt leaves exactly one warning.
func TestHandler_StashAndLoadout_RefusalIsLoggedOnce(t *testing.T) {
	for _, rpc := range ownedRPCs {
		t.Run(rpc.name, func(t *testing.T) {
			var warns []slog.Record
			prev := slog.Default()
			slog.SetDefault(slog.New(warnCounter{warns: &warns}))
			t.Cleanup(func() { slog.SetDefault(prev) })

			owner := uuid.New()
			h := NewHandler(stashService(&stashRepo{owner: owner}), nil)
			intruder := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: uuid.New()})

			_ = rpc.call(h, intruder, owner.String())

			if len(warns) != 1 {
				t.Fatalf("got %d warnings, want 1", len(warns))
			}
			var method string
			warns[0].Attrs(func(a slog.Attr) bool {
				if a.Key == "method" {
					method = a.Value.String()
				}
				return true
			})
			if method != rpc.name {
				t.Errorf("warning method = %q, want %q", method, rpc.name)
			}
		})
	}
}

// fakeMoveService answers MoveItemInstance with location or err and records
// what the handler handed it.
type fakeMoveService struct {
	Service
	location string
	err      error

	called    bool
	gotCaller uuid.UUID
	gotReq    *MoveItemInstanceRequest
}

func (f *fakeMoveService) MoveItemInstance(_ context.Context, caller uuid.UUID, req *MoveItemInstanceRequest) (string, error) {
	f.called, f.gotCaller, f.gotReq = true, caller, req
	return f.location, f.err
}

// FS-VPD8Y R12-R13: the caller is the token's member; the wire speaks bag |
// stash; not found → NotFound; a domain refusal → FailedPrecondition with the
// code as its ErrorInfo reason; malformed input → InvalidArgument; anything
// else → Internal.
func TestHandler_MoveItemInstance_Outcomes(t *testing.T) {
	itemID := uuid.New()
	dbDown := errors.New("connection refused")

	tests := []struct {
		name         string
		id           string
		location     string
		svc          *fakeMoveService
		wantCode     codes.Code
		wantReason   errcode.Code
		wantStored   string
		wantLocation string
	}{
		{name: "moved to the stash", id: itemID.String(), location: "stash",
			svc: &fakeMoveService{location: LocationStash}, wantCode: codes.OK, wantStored: LocationStash, wantLocation: "stash"},
		{name: "moved to the bag", id: itemID.String(), location: "bag",
			svc: &fakeMoveService{location: LocationBag}, wantCode: codes.OK, wantStored: LocationBag, wantLocation: "bag"},
		{name: "not the caller's", id: itemID.String(), location: "bag",
			svc: &fakeMoveService{err: fmt.Errorf("move: %w", commonconstants.ErrNotFound)}, wantCode: codes.NotFound, wantStored: LocationBag},
		{name: "worn", id: itemID.String(), location: "stash",
			svc: &fakeMoveService{err: errcode.Refuse(errcode.ItemWorn)}, wantCode: codes.FailedPrecondition, wantReason: errcode.ItemWorn, wantStored: LocationStash},
		{name: "bag full", id: itemID.String(), location: "bag",
			svc: &fakeMoveService{err: errcode.Refuse(errcode.BagFull)}, wantCode: codes.FailedPrecondition, wantReason: errcode.BagFull, wantStored: LocationBag},
		{name: "infrastructure failure", id: itemID.String(), location: "bag",
			svc: &fakeMoveService{err: dbDown}, wantCode: codes.Internal, wantStored: LocationBag},
		{name: "malformed id", id: "not-a-uuid", location: "bag",
			svc: &fakeMoveService{}, wantCode: codes.InvalidArgument},
		{name: "unknown location", id: itemID.String(), location: "worn",
			svc: &fakeMoveService{}, wantCode: codes.InvalidArgument},
		{name: "stored spelling is not the wire's", id: itemID.String(), location: "BAG",
			svc: &fakeMoveService{}, wantCode: codes.InvalidArgument},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller, character := uuid.New(), uuid.New()
			ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: caller})

			res, err := NewHandler(tt.svc, nil).MoveItemInstance(ctx, &pb.MoveItemInstanceRequest{ItemInstanceId: tt.id, Location: tt.location, CharacterId: character.String()})

			st := status.Convert(err)
			if st.Code() != tt.wantCode {
				t.Fatalf("code = %v (%v), want %v", st.Code(), err, tt.wantCode)
			}
			if reason, ok := errcode.RefusalReason(st); tt.wantReason != "" && (!ok || reason != tt.wantReason) {
				t.Errorf("reason = %q, %v; want %q", reason, ok, tt.wantReason)
			}
			if tt.wantStored == "" {
				if tt.svc.called {
					t.Errorf("service called for malformed input")
				}
				return
			}
			if tt.svc.gotReq.CharacterID != character {
				t.Errorf("character = %v, want the request's %v", tt.svc.gotReq.CharacterID, character)
			}
			if tt.svc.gotCaller != caller || tt.svc.gotReq.ItemInstanceID != itemID || tt.svc.gotReq.Location != tt.wantStored {
				t.Errorf("service got (%v, %+v), want (%v, {%v %s})", tt.svc.gotCaller, tt.svc.gotReq, caller, itemID, tt.wantStored)
			}
			if tt.wantCode == codes.OK && (res.GetId() != itemID.String() || res.GetLocation() != tt.wantLocation) {
				t.Errorf("response = %+v, want {%v %s}", res, itemID, tt.wantLocation)
			}
		})
	}
}

func TestHandler_MoveItemInstance_NeedsAnIdentity(t *testing.T) {
	svc := &fakeMoveService{}
	_, err := NewHandler(svc, nil).MoveItemInstance(context.Background(), &pb.MoveItemInstanceRequest{ItemInstanceId: uuid.NewString(), Location: "bag", CharacterId: uuid.NewString()})

	if status.Code(err) != codes.Unauthenticated || svc.called {
		t.Errorf("code = %v, called = %v; want Unauthenticated and no call", status.Code(err), svc.called)
	}
}

// fakeReserveService answers ReserveItem with item or err and records who the
// handler reserved for.
type fakeReserveService struct {
	Service
	item *ItemInstance
	err  error

	gotSeller, gotItem uuid.UUID
}

func (f *fakeReserveService) ReserveItem(_ context.Context, seller, itemID uuid.UUID, _ int64, _ *int64, _ time.Time) (*ItemInstance, error) {
	f.gotSeller, f.gotItem = seller, itemID
	return f.item, f.err
}

// FS-HBXZN R5: a domain refusal → FailedPrecondition with the code as its
// ErrorInfo reason; not found → NotFound; anything else → Internal with a fixed
// message that never carries the error's text.
func TestHandler_ReserveItem_Outcomes(t *testing.T) {
	itemID := uuid.New()
	secret := "pq: relation item_instances does not exist"

	tests := []struct {
		name       string
		svc        *fakeReserveService
		wantCode   codes.Code
		wantReason errcode.Code
	}{
		{name: "reserved", svc: &fakeReserveService{item: &ItemInstance{ID: itemID, Status: "LISTED"}}, wantCode: codes.OK},
		{name: "worn", svc: &fakeReserveService{err: errcode.Refuse(errcode.ItemWorn)},
			wantCode: codes.FailedPrecondition, wantReason: errcode.ItemWorn},
		{name: "wrapped not available", svc: &fakeReserveService{err: fmt.Errorf("reserve: %w", errcode.Refuse(errcode.ItemNotAvailable))},
			wantCode: codes.FailedPrecondition, wantReason: errcode.ItemNotAvailable},
		// FS-XEDFF R5: the listed-item cap
		{name: "wrapped listing limit reached", svc: &fakeReserveService{err: fmt.Errorf("reserve: %w", errcode.Refuse(errcode.ListingLimitReached))},
			wantCode: codes.FailedPrecondition, wantReason: errcode.ListingLimitReached},
		{name: "not the seller's", svc: &fakeReserveService{err: fmt.Errorf("reserve: %w", commonconstants.ErrNotFound)},
			wantCode: codes.NotFound},
		{name: "infrastructure failure", svc: &fakeReserveService{err: errors.New(secret)},
			wantCode: codes.Internal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seller := uuid.New()
			ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: seller})

			res, err := NewHandler(tt.svc, nil).ReserveItem(ctx, &pb.ReserveItemRequest{ItemId: itemID.String(), StartPrice: 100})

			st := status.Convert(err)
			if st.Code() != tt.wantCode {
				t.Fatalf("code = %v (%v), want %v", st.Code(), err, tt.wantCode)
			}
			if reason, ok := errcode.RefusalReason(st); tt.wantReason != "" && (!ok || reason != tt.wantReason) {
				t.Errorf("reason = %q, %v; want %q", reason, ok, tt.wantReason)
			}
			if tt.svc.err != nil && strings.Contains(st.Message(), "pq:") {
				t.Errorf("message = %q, must not carry the error's text", st.Message())
			}
			if tt.svc.gotSeller != seller || tt.svc.gotItem != itemID {
				t.Errorf("service got (%v, %v), want (%v, %v)", tt.svc.gotSeller, tt.svc.gotItem, seller, itemID)
			}
			if tt.wantCode == codes.OK && res.GetId() != itemID.String() {
				t.Errorf("response id = %q, want %v", res.GetId(), itemID)
			}
		})
	}
}

// fakeLoadoutWriteService answers UpdateLoadout with err.
type fakeLoadoutWriteService struct {
	Service
	err error
}

func (f *fakeLoadoutWriteService) UpdateLoadout(context.Context, uuid.UUID, *UpdateLoadoutRequest) error {
	return f.err
}

// FS-VPD8Y R13, R18: a loadout write's domain refusal reaches the gateway as
// FailedPrecondition carrying its code as the ErrorInfo reason; anything else
// it did not map before stays Internal.
func TestHandler_UpdateLoadout_Outcomes(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantCode   codes.Code
		wantReason errcode.Code
	}{
		{"written", nil, codes.OK, ""},
		{"bag full", errcode.Refuse(errcode.BagFull), codes.FailedPrecondition, errcode.BagFull},
		{"wrapped bag full", fmt.Errorf("update loadout: %w", errcode.Refuse(errcode.BagFull)), codes.FailedPrecondition, errcode.BagFull},
		// FS-18Z5F R32, R33: equipping an item not AVAILABLE
		{"item not available", errcode.Refuse(errcode.ItemNotAvailable), codes.FailedPrecondition, errcode.ItemNotAvailable},
		// FS-50MTX R15: absent, not the caller's or held by another character
		{"item not found", fmt.Errorf("equip: %w", commonconstants.ErrNotFound), codes.NotFound, ""},
		{"infrastructure failure", errors.New("connection refused"), codes.Internal, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			caller := uuid.New()
			ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: caller})

			_, err := NewHandler(&fakeLoadoutWriteService{err: tt.err}, nil).UpdateLoadout(ctx,
				&pb.UpdateLoadoutRequest{MemberId: caller.String(), CharacterId: uuid.NewString(), Slot: "weapon"})

			st := status.Convert(err)
			if st.Code() != tt.wantCode {
				t.Fatalf("code = %v (%v), want %v", st.Code(), err, tt.wantCode)
			}
			reason, ok := errcode.RefusalReason(st)
			if tt.wantReason != "" && (!ok || reason != tt.wantReason) {
				t.Errorf("reason = %q, %v; want %q", reason, ok, tt.wantReason)
			}
			if tt.wantReason == "" && ok {
				t.Errorf("reason = %q, want none", reason)
			}
		})
	}
}

// fakeReconcileService serves the reservation calls and records what the
// handler handed it. miss makes confirm and release match nothing.
type fakeReconcileService struct {
	Service
	stale []StaleReservation
	// staleNext is the position the stale page answers as next
	staleNext *cursor.ReservedAt
	miss      bool
	page      *ConfirmedReservationPage
	listErr   error
	// releaseErr fails ReleaseConfirmedReservation, as a database failure would
	releaseErr error

	listCalled   bool
	gotOlderThan time.Duration
	gotAfter     *cursor.UpdatedAt
	gotLimit     int
	// gotStaleAfter is the position ListStaleReserved was asked to read after
	gotStaleAfter *cursor.ReservedAt
	cancelled     []StaleReservation
	confirmed     []StaleReservation
	released      []StaleReservation
}

func (f *fakeReconcileService) ReleaseConfirmedReservation(_ context.Context, itemID, listingID uuid.UUID) (bool, error) {
	if f.releaseErr != nil {
		return false, f.releaseErr
	}
	f.released = append(f.released, StaleReservation{ItemID: itemID, ListingID: listingID})
	return !f.miss, nil
}

func (f *fakeReconcileService) ListConfirmedReservations(_ context.Context, olderThan time.Duration, after *cursor.UpdatedAt, limit int) (*ConfirmedReservationPage, error) {
	f.listCalled, f.gotOlderThan, f.gotAfter, f.gotLimit = true, olderThan, after, limit
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.page, nil
}

func (f *fakeReconcileService) ListStaleReserved(_ context.Context, olderThan time.Duration, after *cursor.ReservedAt, limit int) (*StaleReservationPage, error) {
	f.listCalled, f.gotOlderThan, f.gotStaleAfter, f.gotLimit = true, olderThan, after, limit
	if f.listErr != nil {
		return nil, f.listErr
	}
	return &StaleReservationPage{Reservations: f.stale, Next: f.staleNext}, nil
}

func (f *fakeReconcileService) CancelReservation(_ context.Context, itemID, listingID uuid.UUID) (bool, error) {
	f.cancelled = append(f.cancelled, StaleReservation{ItemID: itemID, ListingID: listingID})
	return true, nil
}

func (f *fakeReconcileService) ConfirmReservation(_ context.Context, itemID, listingID uuid.UUID) (bool, error) {
	f.confirmed = append(f.confirmed, StaleReservation{ItemID: itemID, ListingID: listingID})
	return !f.miss, nil
}

// reconcilerCtx is what marketplace's background reconciler arrives with: no
// member, because there is no request behind the sweep.
func reconcilerCtx() context.Context {
	return context.Background()
}

// The age is measured by items-service on its database clock, so the caller only
// says how old. A missing or non-positive age would make every reservation stale,
// a listing created a second ago included, so it is refused rather than run; a
// position that cannot be read is refused too, never read as "start over"
// (FS-9BJCP Req 4).
func TestHandler_ListStaleReserved_RefusesAnUnsafeRequest(t *testing.T) {
	tests := []struct {
		name      string
		olderThan *durationpb.Duration
		after     string
	}{
		{name: "missing", olderThan: nil},
		{name: "zero", olderThan: durationpb.New(0)},
		{name: "negative", olderThan: durationpb.New(-time.Minute)},
		{name: "malformed position", olderThan: durationpb.New(10 * time.Minute), after: "%%not-a-cursor%%"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeReconcileService{}

			_, err := NewHandler(svc, nil).ListStaleReserved(reconcilerCtx(), &pb.ListStaleReservedRequest{OlderThan: tt.olderThan, After: tt.after})

			if status.Code(err) != codes.InvalidArgument {
				t.Errorf("code = %v, want InvalidArgument", status.Code(err))
			}
			if svc.listCalled {
				t.Error("service must not be asked with an unsafe age")
			}
		})
	}
}

// The handler hands the age, the decoded position and the limit to the service,
// and answers the next position as an opaque string, empty on the last page
// (FS-9BJCP Req 1, 2).
func TestHandler_ListStaleReserved_PagesThroughTheService(t *testing.T) {
	after := cursor.ReservedAt{ID: uuid.New(), ReservedAt: time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)}
	next := cursor.ReservedAt{ID: uuid.New(), ReservedAt: time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC)}

	tests := []struct {
		name     string
		after    string
		next     *cursor.ReservedAt
		wantNext string
	}{
		{name: "first page with more after it", next: &next, wantNext: next.Encode()},
		{name: "last page from a position", after: after.Encode()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeReconcileService{staleNext: tt.next}

			res, err := NewHandler(svc, nil).ListStaleReserved(reconcilerCtx(), &pb.ListStaleReservedRequest{
				OlderThan: durationpb.New(10 * time.Minute), After: tt.after, Limit: 25,
			})

			if err != nil {
				t.Fatalf("ListStaleReserved: %v", err)
			}
			if svc.gotLimit != 25 {
				t.Errorf("service limit = %d, want 25", svc.gotLimit)
			}
			if tt.after == "" && svc.gotStaleAfter != nil {
				t.Errorf("service position = %+v, want none on the first page", svc.gotStaleAfter)
			}
			if tt.after != "" && (svc.gotStaleAfter == nil || svc.gotStaleAfter.ID != after.ID || !svc.gotStaleAfter.ReservedAt.Equal(after.ReservedAt)) {
				t.Errorf("service position = %+v, want %+v", svc.gotStaleAfter, after)
			}
			if res.GetNext() != tt.wantNext {
				t.Errorf("next = %q, want %q", res.GetNext(), tt.wantNext)
			}
		})
	}
}

func TestHandler_ListStaleReserved_DatabaseFailureIsInternal(t *testing.T) {
	svc := &fakeReconcileService{listErr: errors.New("connection refused")}

	_, err := NewHandler(svc, nil).ListStaleReserved(reconcilerCtx(), &pb.ListStaleReservedRequest{OlderThan: durationpb.New(10 * time.Minute)})

	if status.Code(err) != codes.Internal {
		t.Errorf("code = %v, want Internal", status.Code(err))
	}
}

// Each stale reservation comes back with the listing it was made for, so the
// follow-up cancel or confirm can be fenced on that listing.
func TestHandler_ListStaleReserved_ReturnsItemAndListing(t *testing.T) {
	stale := StaleReservation{ItemID: uuid.New(), ListingID: uuid.New()}
	svc := &fakeReconcileService{stale: []StaleReservation{stale}}

	res, err := NewHandler(svc, nil).ListStaleReserved(reconcilerCtx(), &pb.ListStaleReservedRequest{OlderThan: durationpb.New(10 * time.Minute)})

	if err != nil {
		t.Fatalf("ListStaleReserved: %v", err)
	}
	if svc.gotOlderThan != 10*time.Minute {
		t.Errorf("service olderThan = %v, want 10m", svc.gotOlderThan)
	}
	if len(res.GetReservations()) != 1 {
		t.Fatalf("reservations = %v, want one", res.GetReservations())
	}
	got := res.GetReservations()[0]
	if got.GetItemId() != stale.ItemID.String() || got.GetListingId() != stale.ListingID.String() {
		t.Errorf("reservation = %v, want item %s listing %s", got, stale.ItemID, stale.ListingID)
	}
}

// Cancel, confirm and release act on one reservation, named by item and listing. Without a
// valid listing id the write would be unfenced, so it is refused before the
// service is reached.
func TestHandler_ReservationWrites_NeedItemAndListing(t *testing.T) {
	itemID, listingID := uuid.New(), uuid.New()

	writes := []struct {
		name  string
		write func(h *Handler, itemID, listingID string) error
		got   func(f *fakeReconcileService) []StaleReservation
	}{
		{name: "cancel", write: func(h *Handler, item, listing string) error {
			_, err := h.CancelReservation(reconcilerCtx(), &pb.CancelReservationRequest{ItemId: item, ListingId: listing})
			return err
		}, got: func(f *fakeReconcileService) []StaleReservation { return f.cancelled }},
		{name: "confirm", write: func(h *Handler, item, listing string) error {
			_, err := h.ConfirmReservation(reconcilerCtx(), &pb.ConfirmReservationRequest{ItemId: item, ListingId: listing})
			return err
		}, got: func(f *fakeReconcileService) []StaleReservation { return f.confirmed }},
		{name: "release", write: func(h *Handler, item, listing string) error {
			_, err := h.ReleaseConfirmedReservation(reconcilerCtx(), &pb.ReleaseConfirmedReservationRequest{ItemId: item, ListingId: listing})
			return err
		}, got: func(f *fakeReconcileService) []StaleReservation { return f.released }},
	}
	cases := []struct {
		name      string
		itemID    string
		listingID string
		wantCode  codes.Code
	}{
		{name: "both ids", itemID: itemID.String(), listingID: listingID.String(), wantCode: codes.OK},
		{name: "missing listing id", itemID: itemID.String(), listingID: "", wantCode: codes.InvalidArgument},
		{name: "malformed listing id", itemID: itemID.String(), listingID: "nope", wantCode: codes.InvalidArgument},
		{name: "malformed item id", itemID: "nope", listingID: listingID.String(), wantCode: codes.InvalidArgument},
	}
	for _, w := range writes {
		for _, c := range cases {
			t.Run(w.name+"/"+c.name, func(t *testing.T) {
				svc := &fakeReconcileService{}

				err := w.write(NewHandler(svc, nil), c.itemID, c.listingID)

				if status.Code(err) != c.wantCode {
					t.Fatalf("code = %v, want %v", status.Code(err), c.wantCode)
				}
				got := w.got(svc)
				if c.wantCode != codes.OK {
					if len(got) != 0 {
						t.Errorf("service reached with %v, want not reached", got)
					}
					return
				}
				want := StaleReservation{ItemID: itemID, ListingID: listingID}
				if len(got) != 1 || got[0] != want {
					t.Errorf("service got %v, want [%v]", got, want)
				}
			})
		}
	}
}

// Confirm and release tell the caller whether they matched (FS-04ZB6 Req 1, 2,
// 4): marketplace drops an event whose confirm missed, and logs a release that
// did.
func TestHandler_ReservationWrites_AnswerWhetherTheyMatched(t *testing.T) {
	itemID, listingID := uuid.New().String(), uuid.New().String()
	for _, miss := range []bool{false, true} {
		t.Run(fmt.Sprintf("miss=%v", miss), func(t *testing.T) {
			h := NewHandler(&fakeReconcileService{miss: miss}, nil)

			confirmed, err := h.ConfirmReservation(reconcilerCtx(), &pb.ConfirmReservationRequest{ItemId: itemID, ListingId: listingID})
			if err != nil {
				t.Fatalf("confirm: %v", err)
			}
			released, err := h.ReleaseConfirmedReservation(reconcilerCtx(), &pb.ReleaseConfirmedReservationRequest{ItemId: itemID, ListingId: listingID})
			if err != nil {
				t.Fatalf("release: %v", err)
			}

			if confirmed.GetConfirmed() == miss {
				t.Errorf("confirmed = %v, want %v", confirmed.GetConfirmed(), !miss)
			}
			if released.GetReleased() == miss {
				t.Errorf("released = %v, want %v", released.GetReleased(), !miss)
			}
		})
	}
}

// As for stale reservations, a missing or non-positive age would list every
// confirmed reservation, one confirmed a second ago included, and a malformed
// position cannot be read from: both are refused before the service is asked.
func TestHandler_ListConfirmedReservations_RefusesAnUnsafeRequest(t *testing.T) {
	tests := []struct {
		name      string
		olderThan *durationpb.Duration
		after     string
	}{
		{name: "missing age", olderThan: nil},
		{name: "zero age", olderThan: durationpb.New(0)},
		{name: "negative age", olderThan: durationpb.New(-time.Minute)},
		{name: "malformed position", olderThan: durationpb.New(10 * time.Minute), after: "%%not-a-cursor%%"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeReconcileService{page: &ConfirmedReservationPage{}}

			_, err := NewHandler(svc, nil).ListConfirmedReservations(reconcilerCtx(), &pb.ListConfirmedReservationsRequest{OlderThan: tt.olderThan, After: tt.after})

			if status.Code(err) != codes.InvalidArgument {
				t.Errorf("code = %v, want InvalidArgument", status.Code(err))
			}
			if svc.listCalled {
				t.Error("service must not be asked with an unsafe request")
			}
		})
	}
}

// The handler hands the age, the decoded position and the limit to the service,
// and answers each entry with its listing and the next position as an opaque
// string, empty on the last page.
func TestHandler_ListConfirmedReservations_PagesThroughTheService(t *testing.T) {
	entry := ConfirmedReservation{ItemID: uuid.New(), ListingID: uuid.New(), UpdatedAt: time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC)}
	after := cursor.UpdatedAt{ID: uuid.New(), UpdatedAt: time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC)}
	next := cursor.UpdatedAt{ID: entry.ItemID, UpdatedAt: entry.UpdatedAt}

	tests := []struct {
		name     string
		after    string
		next     *cursor.UpdatedAt
		wantNext string
	}{
		{name: "first page with more after it", next: &next, wantNext: next.Encode()},
		{name: "last page from a position", after: after.Encode()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeReconcileService{page: &ConfirmedReservationPage{Reservations: []ConfirmedReservation{entry}, Next: tt.next}}

			res, err := NewHandler(svc, nil).ListConfirmedReservations(reconcilerCtx(), &pb.ListConfirmedReservationsRequest{
				OlderThan: durationpb.New(10 * time.Minute), After: tt.after, Limit: 25,
			})

			if err != nil {
				t.Fatalf("ListConfirmedReservations: %v", err)
			}
			if svc.gotOlderThan != 10*time.Minute || svc.gotLimit != 25 {
				t.Errorf("service asked for %v, limit %d; want 10m, limit 25", svc.gotOlderThan, svc.gotLimit)
			}
			if tt.after == "" && svc.gotAfter != nil {
				t.Errorf("service position = %+v, want none on the first page", svc.gotAfter)
			}
			if tt.after != "" && (svc.gotAfter == nil || svc.gotAfter.ID != after.ID || !svc.gotAfter.UpdatedAt.Equal(after.UpdatedAt)) {
				t.Errorf("service position = %+v, want %+v", svc.gotAfter, after)
			}
			if len(res.GetReservations()) != 1 || res.GetReservations()[0].GetItemId() != entry.ItemID.String() || res.GetReservations()[0].GetListingId() != entry.ListingID.String() {
				t.Errorf("reservations = %v, want item %s listing %s", res.GetReservations(), entry.ItemID, entry.ListingID)
			}
			if res.GetNext() != tt.wantNext {
				t.Errorf("next = %q, want %q", res.GetNext(), tt.wantNext)
			}
		})
	}
}

func TestHandler_ListConfirmedReservations_DatabaseFailureIsInternal(t *testing.T) {
	svc := &fakeReconcileService{listErr: errors.New("connection refused")}

	_, err := NewHandler(svc, nil).ListConfirmedReservations(reconcilerCtx(), &pb.ListConfirmedReservationsRequest{OlderThan: durationpb.New(10 * time.Minute)})

	if status.Code(err) != codes.Internal {
		t.Errorf("code = %v, want Internal", status.Code(err))
	}
}

// A release whose write failed decided nothing the caller can rely on: it is
// Internal, which marketplace reads as a transport failure and retries, never
// as released = false (FS-04ZB6 §API surface).
func TestHandler_ReleaseConfirmedReservation_DatabaseFailureIsInternal(t *testing.T) {
	svc := &fakeReconcileService{releaseErr: errors.New("connection refused")}

	res, err := NewHandler(svc, nil).ReleaseConfirmedReservation(reconcilerCtx(), &pb.ReleaseConfirmedReservationRequest{
		ItemId:    uuid.NewString(),
		ListingId: uuid.NewString(),
	})

	if status.Code(err) != codes.Internal {
		t.Errorf("code = %v, want Internal", status.Code(err))
	}
	if res != nil {
		t.Errorf("response = %v, want none", res)
	}
}

// FS-50MTX R10, R18: a write names its character. Missing or malformed never
// reach the service, and answer InvalidArgument.
func TestHandler_LoadoutAndMoveRefuseABadCharacter(t *testing.T) {
	for name, character := range map[string]string{"missing": "", "malformed": "nope"} {
		t.Run(name, func(t *testing.T) {
			caller := uuid.New()
			ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: caller})

			_, loadoutErr := NewHandler(&fakeLoadoutWriteService{}, nil).UpdateLoadout(ctx,
				&pb.UpdateLoadoutRequest{MemberId: caller.String(), CharacterId: character, Slot: "weapon"})
			if code := status.Code(loadoutErr); code != codes.InvalidArgument {
				t.Errorf("UpdateLoadout code = %v, want InvalidArgument", code)
			}

			move := &fakeMoveService{}
			_, moveErr := NewHandler(move, nil).MoveItemInstance(ctx,
				&pb.MoveItemInstanceRequest{ItemInstanceId: uuid.NewString(), Location: "bag", CharacterId: character})
			if code := status.Code(moveErr); code != codes.InvalidArgument {
				t.Errorf("MoveItemInstance code = %v, want InvalidArgument", code)
			}
			if move.called {
				t.Errorf("service called for a bad character")
			}
		})
	}
}

// FS-50MTX R10: the nil uuid is well formed, so a write naming it goes through
// the ownership check like any other unknown character: 404, nothing written.
func TestHandler_CharacterWrites_NilCharacterIsNotFound(t *testing.T) {
	owner := uuid.New()
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner})
	nilID := uuid.Nil.String()
	writes := []struct {
		name string
		call func(h *Handler) error
	}{
		{"UpdateLoadout", func(h *Handler) error {
			_, err := h.UpdateLoadout(ctx, &pb.UpdateLoadoutRequest{MemberId: owner.String(), CharacterId: nilID, Slot: "weapon", ItemInstanceId: uuid.NewString()})
			return err
		}},
		{"MoveItemInstance", func(h *Handler) error {
			_, err := h.MoveItemInstance(ctx, &pb.MoveItemInstanceRequest{ItemInstanceId: uuid.NewString(), Location: "bag", CharacterId: nilID})
			return err
		}},
	}
	for _, write := range writes {
		t.Run(write.name, func(t *testing.T) {
			repo := &stashRepo{owner: owner}
			svc := stashService(repo)
			check := &characterCheck{owned: false}
			svc.characters = check

			err := write.call(NewHandler(svc, nil))

			if got := status.Code(err); got != codes.NotFound {
				t.Fatalf("code = %v, want NotFound (err %v)", got, err)
			}
			if len(check.characters) != 1 || check.characters[0] != uuid.Nil {
				t.Errorf("checked characters %v, want the nil uuid once", check.characters)
			}
			if repo.reads != 0 || repo.writes != 0 {
				t.Errorf("a refused write reached the repository: %d reads, %d writes", repo.reads, repo.writes)
			}
		})
	}
}

// FS-50MTX R10, R11: a refused character check reaches the caller as 404 or
// 503, the two kept apart, and the write never starts.
func TestHandler_CharacterWrites_CheckRefusalAnswers(t *testing.T) {
	owner := uuid.New()
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner})
	writes := []struct {
		name string
		call func(h *Handler) error
	}{
		{"UpdateLoadout", func(h *Handler) error {
			_, err := h.UpdateLoadout(ctx, &pb.UpdateLoadoutRequest{MemberId: owner.String(), CharacterId: uuid.NewString(), Slot: "weapon", ItemInstanceId: uuid.NewString()})
			return err
		}},
		{"MoveItemInstance", func(h *Handler) error {
			_, err := h.MoveItemInstance(ctx, &pb.MoveItemInstanceRequest{ItemInstanceId: uuid.NewString(), Location: "bag", CharacterId: uuid.NewString()})
			return err
		}},
	}
	checks := []struct {
		name     string
		check    *characterCheck
		wantCode codes.Code
	}{
		{"foreign, deleted or unknown character", &characterCheck{owned: false}, codes.NotFound},
		{"character-service unreachable", &characterCheck{err: status.Error(codes.Unavailable, "connection refused")}, codes.Unavailable},
		{"character-service stalled past the deadline", &characterCheck{err: status.Error(codes.DeadlineExceeded, "context deadline exceeded")}, codes.Unavailable},
		{"character-service answers an unexpected failure", &characterCheck{err: status.Error(codes.Internal, "boom")}, codes.Unavailable},
	}
	for _, write := range writes {
		for _, tt := range checks {
			t.Run(write.name+"/"+tt.name, func(t *testing.T) {
				repo := &stashRepo{owner: owner}
				svc := stashService(repo)
				svc.characters = tt.check

				err := write.call(NewHandler(svc, nil))

				if got := status.Code(err); got != tt.wantCode {
					t.Fatalf("code = %v, want %v (err %v)", got, tt.wantCode, err)
				}
				if repo.reads != 0 || repo.writes != 0 {
					t.Errorf("a refused write reached the repository: %d reads, %d writes", repo.reads, repo.writes)
				}
			})
		}
	}
}
