package item

import (
	"encoding/json"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// This is the test that makes the JSON round-trip in asWire safe.
//
// The legacy handlers marshalled protobuf structs straight onto the wire. The
// transport mirrors reproduce those bytes only while their json tags agree with
// the proto's — so this marshals a POPULATED proto, converts it, marshals the
// mirror, and requires the two byte strings to be identical.
//
// Populated matters: every proto field is `omitempty`, so comparing zero values
// would compare "{}" against "{}" and prove nothing.
func TestWireTypes_RoundTripProducesIdenticalBytes(t *testing.T) {
	ts := timestamppb.New(mustTime())

	tests := []struct {
		name string
		src  any
		conv func(any) (any, error)
	}{
		{
			name: "WeaponDetail",
			src: &pb.WeaponDetail{
				Id: "w-1", RarityId: "r-1", AttackPower: 42, CriticalRate: 1.5,
				WeaponType: "sword", Description: "sharp", ItemTemplateId: "t-1",
				ItemName: "Blade", ItemCode: "BLADE", IconUrl: "http://icon",
				RequiredLevel: 3, BaseSellPrice: 10, BaseBuyPrice: 20,
				CreatedAt: ts, UpdatedAt: ts,
			},
			conv: func(s any) (any, error) { return asWire[WeaponDetail](s) },
		},
		{
			name: "ArmorDetail",
			src: &pb.ArmorDetail{
				Id: "a-1", RarityId: "r-2", DefenseRating: 7, MagicResistance: 2,
				ArmorSlot: "chest", Description: "sturdy", ItemName: "Plate",
				CreatedAt: ts, UpdatedAt: ts,
			},
			conv: func(s any) (any, error) { return asWire[ArmorDetail](s) },
		},
		{
			name: "ConsumableDetail",
			src: &pb.ConsumableDetail{
				Id: "c-1", RarityId: "r-3", HealingAmount: 50, ManaAmount: 25,
				BuffDuration: 30, MaxStackSize: 99, Description: "bitter",
				ItemName: "Potion", CreatedAt: ts, UpdatedAt: ts,
			},
			conv: func(s any) (any, error) { return asWire[ConsumableDetail](s) },
		},
		{
			name: "ItemTemplate",
			src: &pb.ItemTemplate{
				Id: "t-1", ItemName: "Blade", Rarity: "rare", ItemType: "weapon",
				IconUrl: "http://icon", RequiredLevel: 3, BaseSellPrice: 10,
				BaseBuyPrice: 20, AttackPower: 42, CriticalRate: 1.5,
				WeaponType: "sword", Description: "sharp",
				CreatedAt: ts, UpdatedAt: ts,
			},
			conv: func(s any) (any, error) { return asWire[ItemTemplate](s) },
		},
		{
			name: "Weapon",
			src: &pb.Weapon{
				Id: "w-1", RarityId: "r-1", AttackPower: 42, CriticalRate: 1.5,
				WeaponType: "axe", Description: "heavy", CreatedAt: ts, UpdatedAt: ts,
			},
			conv: func(s any) (any, error) { return asWire[Weapon](s) },
		},
		{
			name: "ItemType",
			src:  &pb.ItemType{Id: "it-1", Name: "weapon"},
			conv: func(s any) (any, error) { return asWire[ItemType](s) },
		},
		{
			name: "ItemRarity",
			src:  &pb.ItemRarity{Id: "ir-1", Name: "rare"},
			conv: func(s any) (any, error) { return asWire[ItemRarity](s) },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			legacy, err := json.Marshal(tt.src)
			require.NoError(t, err)

			mirror, err := tt.conv(tt.src)
			require.NoError(t, err)

			serialized, err := json.Marshal(mirror)
			require.NoError(t, err)

			assert.JSONEq(t, string(legacy), string(serialized),
				"the transport mirror must reproduce the bytes the legacy handler sent")
		})
	}
}

// A repeated field must serialize as [] rather than null when empty: the legacy
// handlers put a proto slice on the wire, and encoding/json renders a nil slice
// as null. Clients iterating it would break on null.
func TestWireTypes_EmptySliceIsNotNull(t *testing.T) {
	out, err := asWireSlice[ItemType](([]*pb.ItemType)(nil))
	require.NoError(t, err)

	raw, err := json.Marshal(out)
	require.NoError(t, err)
	assert.Equal(t, "[]", string(raw))
}

func mustTime() time.Time { return time.Unix(1700000000, 123456789).UTC() }
