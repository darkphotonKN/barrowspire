package mailbox

import (
	"context"
	"testing"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

type fakeSnapshotRPC struct {
	got *itemspb.ResolveItemSnapshotsRequest
	res *itemspb.ResolveItemSnapshotsResponse
	err error
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

	t.Run("an items failure is not an outage", func(t *testing.T) {
		client := &ItemsClient{rpc: &fakeSnapshotRPC{err: status.Error(codes.Internal, "store failed")}, timeout: defaultItemsTimeout}
		_, err := client.ResolveItemSnapshots(context.Background(), []TemplateRef{{TemplateID: uuid.New()}}, nil)
		require.Error(t, err)
		assert.NotErrorIs(t, err, ErrItemsUnavailable)
	})
}
