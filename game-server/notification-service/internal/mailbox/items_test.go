package mailbox

import (
	"context"
	"testing"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/emptypb"
)

type fakeSnapshotRPC struct {
	got *itemspb.ResolveItemSnapshotsRequest
	res *itemspb.ResolveItemSnapshotsResponse
	err error

	grantCalls    int
	gotGrant      *itemspb.GrantItemsRequest
	grantAuth     []string
	grantDeadline bool
	grantRes      *itemspb.GrantItemsResponse
	grantErr      error

	listCalls int
	listRes   *itemspb.ListItemTemplatesResponse
	listErr   error
}

func (f *fakeSnapshotRPC) ListItemTemplates(_ context.Context, _ *emptypb.Empty, _ ...grpc.CallOption) (*itemspb.ListItemTemplatesResponse, error) {
	f.listCalls++
	return f.listRes, f.listErr
}

func (f *fakeSnapshotRPC) GrantItems(ctx context.Context, in *itemspb.GrantItemsRequest, _ ...grpc.CallOption) (*itemspb.GrantItemsResponse, error) {
	f.grantCalls++
	f.gotGrant = in
	md, _ := metadata.FromOutgoingContext(ctx)
	f.grantAuth = md.Get("authorization")
	_, f.grantDeadline = ctx.Deadline()
	return f.grantRes, f.grantErr
}

// withPlayerToken is a claim's context as the auth interceptor leaves it: the
// gateway's forwarded authorization on the incoming metadata.
func withPlayerToken(token string) context.Context {
	return metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", token))
}

func (f *fakeSnapshotRPC) ResolveItemSnapshots(_ context.Context, in *itemspb.ResolveItemSnapshotsRequest, _ ...grpc.CallOption) (*itemspb.ResolveItemSnapshotsResponse, error) {
	f.got = in
	return f.res, f.err
}

func TestItemsClient_ResolvesIndexAlignedSnapshots(t *testing.T) {
	plain, leveled, source, gone := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	rpc := &fakeSnapshotRPC{res: &itemspb.ResolveItemSnapshotsResponse{
		Templates: []*itemspb.ResolvedItemSnapshot{
			{Id: plain.String(), Snapshot: &itemspb.ItemSnapshot{
				TemplateId: plain.String(), Name: "Minor Healing Draught", ItemType: "consumable", Rarity: "normal",
				HealingAmount: proto.Int32(40), ItemLevel: 1, RequiredLevel: 1,
			}},
			{Id: leveled.String(), Snapshot: &itemspb.ItemSnapshot{
				TemplateId: leveled.String(), Name: "Iron Blade", ItemType: "weapon", Rarity: "normal",
				AttackPower: proto.Int32(9), ItemLevel: 40, RequiredLevel: 12,
			}},
		},
		Instances: []*itemspb.ResolvedItemSnapshot{
			{Id: source.String(), Snapshot: &itemspb.ItemSnapshot{
				TemplateId: unique.TemplateID.String(), Name: unique.Name, Description: unique.Description,
				ItemType: "weapon", WeaponType: unique.WeaponType, Rarity: "fabled",
				AttackPower: unique.AttackPower, CriticalRate: unique.CriticalRate,
				ItemLevel: 40, RequiredLevel: 18, UniqueEffectText: unique.UniqueEffectText,
				Affixes: []*itemspb.Affix{{Stat: "attack_speed", Tier: 0, Value: 12}, {Stat: "crit_chance", Tier: 3, Value: 4}},
			}},
			{Id: gone.String()},
		},
		UnknownInstanceIds: []string{gone.String()},
	}}
	client := &ItemsClient{rpc: rpc, timeout: defaultItemsTimeout}

	got, err := client.ResolveItemSnapshots(context.Background(),
		[]TemplateRef{{TemplateID: plain}, {TemplateID: leveled, ItemLevel: ptr(int32(40))}},
		[]uuid.UUID{source, gone})
	require.NoError(t, err)

	require.Len(t, rpc.got.GetTemplates(), 2)
	assert.Nil(t, rpc.got.GetTemplates()[0].ItemLevel, "no item level stays unset, never 0")
	assert.Equal(t, int32(40), rpc.got.GetTemplates()[1].GetItemLevel())
	assert.Equal(t, []string{source.String(), gone.String()}, rpc.got.GetInstanceIds())

	require.Len(t, got.Templates, 2)
	assert.Equal(t, plain, got.Templates[0].TemplateID)
	assert.Equal(t, int32(40), *got.Templates[0].HealingAmount)
	assert.Equal(t, []Affix{}, got.Templates[0].Affixes)
	assert.Equal(t, int32(40), got.Templates[1].ItemLevel)

	require.Len(t, got.Instances, 2)
	assert.Equal(t, unique, got.Instances[0], "a copy carries every fact of the snapshot")
	assert.Nil(t, got.Instances[1])
	assert.Equal(t, []uuid.UUID{gone}, got.UnknownInstanceIDs)
}

func TestItemsClient_ConnectionFailuresAreUnavailable(t *testing.T) {
	for _, c := range []codes.Code{codes.Unavailable, codes.DeadlineExceeded} {
		t.Run(c.String(), func(t *testing.T) {
			client := &ItemsClient{rpc: &fakeSnapshotRPC{err: status.Error(c, "down")}, timeout: defaultItemsTimeout}
			_, err := client.ResolveItemSnapshots(context.Background(), []TemplateRef{{TemplateID: uuid.New()}}, nil)
			assert.ErrorIs(t, err, ErrItemsUnavailable)
		})
	}

	t.Run("items failing inside is unavailable too (R32)", func(t *testing.T) {
		client := &ItemsClient{rpc: &fakeSnapshotRPC{err: status.Error(codes.Internal, "store failed")}, timeout: defaultItemsTimeout}
		_, err := client.ResolveItemSnapshots(context.Background(), []TemplateRef{{TemplateID: uuid.New()}}, nil)
		assert.ErrorIs(t, err, ErrItemsUnavailable)
	})

	t.Run("a request items refuses is not an outage", func(t *testing.T) {
		client := &ItemsClient{rpc: &fakeSnapshotRPC{err: status.Error(codes.InvalidArgument, "too many ids")}, timeout: defaultItemsTimeout}
		_, err := client.ResolveItemSnapshots(context.Background(), []TemplateRef{{TemplateID: uuid.New()}}, nil)
		require.Error(t, err)
		assert.NotErrorIs(t, err, ErrItemsUnavailable)
	})
}

func TestItemsClient_GrantItemsForwardsThePlayersTokenAndTheStoredSnapshots(t *testing.T) {
	first, second, third := uuid.New(), uuid.New(), uuid.New()
	rpc := &fakeSnapshotRPC{grantRes: &itemspb.GrantItemsResponse{
		ItemIds: []string{first.String(), second.String(), third.String()}, AlreadyGranted: true,
	}}
	client := &ItemsClient{rpc: rpc, timeout: defaultItemsTimeout}

	got, err := client.GrantItems(withPlayerToken("Bearer the-players-token"), "mail:l:m",
		[]ItemGrant{{Snapshot: potion, Quantity: 2}, {Snapshot: unique, Quantity: 1}})
	require.NoError(t, err)

	assert.Equal(t, []string{"Bearer the-players-token"}, rpc.grantAuth, "items mints into the token's member's stash")
	assert.True(t, rpc.grantDeadline)
	assert.Equal(t, "mail:l:m", rpc.gotGrant.GetGrantId())
	require.Len(t, rpc.gotGrant.GetItems(), 2)
	assert.True(t, proto.Equal(SnapshotProto(potion), rpc.gotGrant.GetItems()[0].GetSnapshot()))
	assert.Equal(t, int32(2), rpc.gotGrant.GetItems()[0].GetQuantity())
	assert.True(t, proto.Equal(SnapshotProto(unique), rpc.gotGrant.GetItems()[1].GetSnapshot()))
	assert.Equal(t, int32(1), rpc.gotGrant.GetItems()[1].GetQuantity())

	assert.Equal(t, &Grant{ItemIDs: []uuid.UUID{first, second, third}, AlreadyGranted: true}, got)
}

func TestItemsClient_GrantItemsFailures(t *testing.T) {
	lines := []ItemGrant{{Snapshot: potion, Quantity: 1}}

	t.Run("a refusal passes its code through", func(t *testing.T) {
		rpc := &fakeSnapshotRPC{grantErr: errcode.Refuse(errcode.StashFull).(*errcode.Refusal).GRPCStatus().Err()}
		_, err := (&ItemsClient{rpc: rpc, timeout: defaultItemsTimeout}).GrantItems(withPlayerToken("Bearer t"), "k", lines)
		assertRefused(t, err, errcode.StashFull)
	})

	for _, c := range []codes.Code{codes.Unavailable, codes.DeadlineExceeded, codes.Internal} {
		t.Run(c.String()+" is an outage", func(t *testing.T) {
			rpc := &fakeSnapshotRPC{grantErr: status.Error(c, "down")}
			_, err := (&ItemsClient{rpc: rpc, timeout: defaultItemsTimeout}).GrantItems(withPlayerToken("Bearer t"), "k", lines)
			assert.ErrorIs(t, err, ErrItemsUnavailable)
		})
	}

	t.Run("an unmintable snapshot is permanent: neither a refusal code nor an outage", func(t *testing.T) {
		rpc := &fakeSnapshotRPC{grantErr: status.Error(codes.InvalidArgument, "an item snapshot cannot be minted")}
		_, err := (&ItemsClient{rpc: rpc, timeout: defaultItemsTimeout}).GrantItems(withPlayerToken("Bearer t"), "k", lines)
		require.Error(t, err)
		assert.ErrorIs(t, err, errGrantUnmintable)
		var refusal *errcode.Refusal
		assert.NotErrorAs(t, err, &refusal)
		assert.NotErrorIs(t, err, ErrItemsUnavailable)
	})

	t.Run("without a token to forward nothing is called", func(t *testing.T) {
		rpc := &fakeSnapshotRPC{}
		_, err := (&ItemsClient{rpc: rpc, timeout: defaultItemsTimeout}).GrantItems(context.Background(), "k", lines)
		require.Error(t, err)
		assert.Zero(t, rpc.grantCalls)
	})
}

// The welcome potion is found by name in the catalogue, because its template id differs per
// environment (seeded by the dev seed, not a migration).
func TestItemsClient_FindTemplateByName(t *testing.T) {
	lesser, greater := uuid.New(), uuid.New()
	catalogue := &itemspb.ListItemTemplatesResponse{Items: []*itemspb.ItemTemplate{
		{Id: greater.String(), ItemName: "Greater Heal Potion"},
		{Id: lesser.String(), ItemName: "Lesser Heal Potion"},
	}}

	t.Run("an exact name, ignoring case and spaces at either end", func(t *testing.T) {
		client := &ItemsClient{rpc: &fakeSnapshotRPC{listRes: catalogue}, timeout: defaultItemsTimeout}
		id, found, err := client.FindTemplateByName(context.Background(), "  lesser heal potion ")
		require.NoError(t, err)
		assert.True(t, found)
		assert.Equal(t, lesser, id)
	})

	t.Run("no template of that name", func(t *testing.T) {
		client := &ItemsClient{rpc: &fakeSnapshotRPC{listRes: catalogue}, timeout: defaultItemsTimeout}
		_, found, err := client.FindTemplateByName(context.Background(), "Heal Potion")
		require.NoError(t, err)
		assert.False(t, found, "a partial name is not a match")
	})

	t.Run("items down is unavailable", func(t *testing.T) {
		client := &ItemsClient{rpc: &fakeSnapshotRPC{listErr: status.Error(codes.Unavailable, "down")}, timeout: defaultItemsTimeout}
		_, _, err := client.FindTemplateByName(context.Background(), "Lesser Heal Potion")
		assert.ErrorIs(t, err, ErrItemsUnavailable)
	})

	t.Run("a malformed id from items is an error, not a match", func(t *testing.T) {
		bad := &itemspb.ListItemTemplatesResponse{Items: []*itemspb.ItemTemplate{{Id: "nope", ItemName: "Lesser Heal Potion"}}}
		client := &ItemsClient{rpc: &fakeSnapshotRPC{listRes: bad}, timeout: defaultItemsTimeout}
		_, _, err := client.FindTemplateByName(context.Background(), "Lesser Heal Potion")
		require.Error(t, err)
	})
}
