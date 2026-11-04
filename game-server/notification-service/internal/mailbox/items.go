package mailbox

import (
	"context"
	"fmt"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// defaultItemsTimeout bounds one resolve, so an items outage answers the
// admin quickly instead of holding the send.
const defaultItemsTimeout = 5 * time.Second

// snapshotRPC is the one items-service call the mailbox makes at send.
type snapshotRPC interface {
	ResolveItemSnapshots(ctx context.Context, in *itemspb.ResolveItemSnapshotsRequest, opts ...grpc.CallOption) (*itemspb.ResolveItemSnapshotsResponse, error)
}

// ItemsClient resolves item enclosures through items-service
// ResolveItemSnapshots (FS-1GZGD R21). The method is tokenless, so no token
// is forwarded.
type ItemsClient struct {
	rpc     snapshotRPC
	timeout time.Duration
}

// NewItemsClient calls items-service over conn.
func NewItemsClient(conn grpc.ClientConnInterface) *ItemsClient {
	return &ItemsClient{rpc: itemspb.NewItemsServiceClient(conn), timeout: defaultItemsTimeout}
}

func (c *ItemsClient) ResolveItemSnapshots(ctx context.Context, templates []TemplateRef, instanceIDs []uuid.UUID) (*Resolution, error) {
	req := &itemspb.ResolveItemSnapshotsRequest{
		Templates:   make([]*itemspb.TemplateSnapshotRequest, 0, len(templates)),
		InstanceIds: make([]string, 0, len(instanceIDs)),
	}
	for _, t := range templates {
		// ItemLevel stays unset when absent: unset is "the template's min
		// level", 0 is an unrepresentable level.
		req.Templates = append(req.Templates, &itemspb.TemplateSnapshotRequest{TemplateId: t.TemplateID.String(), ItemLevel: t.ItemLevel})
	}
	for _, id := range instanceIDs {
		req.InstanceIds = append(req.InstanceIds, id.String())
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	res, err := c.rpc.ResolveItemSnapshots(ctx, req)
	if err != nil {
		// Only a connection failure is an outage. Anything items itself
		// answers (its store failing is Internal) is a plain error.
		if code := status.Code(err); code == codes.Unavailable || code == codes.DeadlineExceeded {
			return nil, fmt.Errorf("%w: %w", ErrItemsUnavailable, err)
		}
		return nil, fmt.Errorf("resolve item snapshots: %w", err)
	}

	out := &Resolution{}
	if out.Templates, err = snapshotsFromProto(res.GetTemplates()); err != nil {
		return nil, err
	}
	if out.Instances, err = snapshotsFromProto(res.GetInstances()); err != nil {
		return nil, err
	}
	if out.UnknownTemplateIDs, err = parseUUIDs(res.GetUnknownTemplateIds()); err != nil {
		return nil, err
	}
	if out.UnknownInstanceIDs, err = parseUUIDs(res.GetUnknownInstanceIds()); err != nil {
		return nil, err
	}
	if out.UnrepresentableIDs, err = parseUUIDs(res.GetUnrepresentableIds()); err != nil {
		return nil, err
	}
	return out, nil
}

func snapshotsFromProto(resolved []*itemspb.ResolvedItemSnapshot) ([]*ItemSnapshot, error) {
	out := make([]*ItemSnapshot, 0, len(resolved))
	for _, r := range resolved {
		if r.Snapshot == nil {
			out = append(out, nil)
			continue
		}
		snap, err := snapshotFromProto(r.GetSnapshot())
		if err != nil {
			return nil, fmt.Errorf("snapshot of %s: %w", r.GetId(), err)
		}
		out = append(out, snap)
	}
	return out, nil
}

func snapshotFromProto(s *itemspb.ItemSnapshot) (*ItemSnapshot, error) {
	templateID, err := uuid.Parse(s.GetTemplateId())
	if err != nil {
		return nil, fmt.Errorf("template id %q: %w", s.GetTemplateId(), err)
	}
	affixes := make([]Affix, 0, len(s.GetAffixes()))
	for _, a := range s.GetAffixes() {
		affixes = append(affixes, Affix{Stat: a.GetStat(), Tier: a.GetTier(), Value: a.GetValue()})
	}
	return &ItemSnapshot{
		TemplateID:       templateID,
		Name:             s.GetName(),
		Description:      s.Description,
		ItemType:         s.GetItemType(),
		WeaponType:       s.WeaponType,
		ArmorSlot:        s.ArmorSlot,
		Rarity:           s.GetRarity(),
		AttackPower:      s.AttackPower,
		CriticalRate:     s.CriticalRate,
		DefenseRating:    s.DefenseRating,
		MagicResistance:  s.MagicResistance,
		HealingAmount:    s.HealingAmount,
		ManaAmount:       s.ManaAmount,
		BuffDuration:     s.BuffDuration,
		Durability:       s.Durability,
		ItemLevel:        s.GetItemLevel(),
		RequiredLevel:    s.GetRequiredLevel(),
		Affixes:          affixes,
		UniqueEffectText: s.UniqueEffectText,
	}, nil
}

// SnapshotProto is a stored snapshot on the wire, for the letters read and
// for the claim's GrantItems (I-1GZGD-4).
func SnapshotProto(s *ItemSnapshot) *itemspb.ItemSnapshot {
	affixes := make([]*itemspb.Affix, 0, len(s.Affixes))
	for _, a := range s.Affixes {
		affixes = append(affixes, &itemspb.Affix{Stat: a.Stat, Tier: a.Tier, Value: a.Value})
	}
	return &itemspb.ItemSnapshot{
		TemplateId:       s.TemplateID.String(),
		Name:             s.Name,
		Description:      s.Description,
		ItemType:         s.ItemType,
		WeaponType:       s.WeaponType,
		ArmorSlot:        s.ArmorSlot,
		Rarity:           s.Rarity,
		AttackPower:      s.AttackPower,
		CriticalRate:     s.CriticalRate,
		DefenseRating:    s.DefenseRating,
		MagicResistance:  s.MagicResistance,
		HealingAmount:    s.HealingAmount,
		ManaAmount:       s.ManaAmount,
		BuffDuration:     s.BuffDuration,
		Durability:       s.Durability,
		ItemLevel:        s.ItemLevel,
		RequiredLevel:    s.RequiredLevel,
		Affixes:          affixes,
		UniqueEffectText: s.UniqueEffectText,
	}
}

func parseUUIDs(raw []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(raw))
	for _, r := range raw {
		id, err := uuid.Parse(r)
		if err != nil {
			return nil, fmt.Errorf("id %q: %w", r, err)
		}
		ids = append(ids, id)
	}
	return ids, nil
}
