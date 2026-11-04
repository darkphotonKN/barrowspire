package items

import (
	"context"
	"fmt"
	"slices"

	"github.com/google/uuid"
)

// representable is FS-1GZGD A1's only check on a snapshot: an item level of
// at least 1 and every affix well formed (a known stat code, tier 0-3, value
// >= 0). Never a drop rule: any affix count at any rarity and any item level
// above the template's band is fine.
func (s *ItemSnapshot) representable() bool {
	if s.ItemLevel < 1 {
		return false
	}
	for _, a := range s.Affixes {
		if !a.wellFormed() {
			return false
		}
	}
	return true
}

// mintable is representable plus what the stored instance needs to read back
// as the snapshot: a required level of its own (>= 1) and no negative
// durability. A resolve never makes a snapshot that fails these; a grant
// checks them because its snapshot comes from the caller.
func (s *ItemSnapshot) mintable() bool {
	return s.representable() && s.RequiredLevel >= 1 && (s.Durability == nil || *s.Durability >= 0)
}

// instance is a brand-new, AVAILABLE instance of the snapshot with id, owned
// by owner, carrying rarityID (the snapshot's rarity code, looked up). The
// location is the insert's to set.
func (s *ItemSnapshot) instance(id, owner uuid.UUID, rarityID *uuid.UUID) *ItemInstance {
	return &ItemInstance{
		ID:              id,
		TemplateID:      s.TemplateID,
		OwnerMemberID:   owner,
		Source:          grantSource,
		ItemType:        s.ItemType,
		Name:            s.Name,
		RarityID:        rarityID,
		AttackPower:     s.AttackPower,
		CriticalRate:    s.CriticalRate,
		WeaponType:      s.WeaponType,
		DefenseRating:   s.DefenseRating,
		MagicResistance: s.MagicResistance,
		ArmorSlot:       s.ArmorSlot,
		HealingAmount:   s.HealingAmount,
		ManaAmount:      s.ManaAmount,
		BuffDuration:    s.BuffDuration,
		Durability:      s.Durability,
		Description:     s.Description,
		Status:          itemStatusAvailable,
		RequiredLevel:   s.RequiredLevel,
		ItemLevel:       s.ItemLevel,
		Affixes:         slices.Clone(s.Affixes),
	}
}

// templateSnapshotRarity is the rarity of every template snapshot: a fresh
// item of a template is Normal (FS-1GZGD A1).
const templateSnapshotRarity = "normal"

// ResolveItemSnapshots resolves templates and existing instances into item
// snapshots (FS-1GZGD R21, A1, A2). A template becomes a fresh item of it:
// base stats, Normal, no affixes, at the requested item level or else its
// min_item_level. An instance becomes a copy of it as it stands. Answers are
// index-aligned with the request; an unknown id, or a known one that is not
// representable, answers nil and is named once in the resolution's lists. No
// drop rule is applied.
func (s *service) ResolveItemSnapshots(ctx context.Context, templates []TemplateSnapshotRequest, instanceIDs []uuid.UUID) (*SnapshotResolution, error) {
	templateIDs := make([]uuid.UUID, 0, len(templates))
	for _, t := range templates {
		templateIDs = append(templateIDs, t.TemplateID)
	}
	facts, err := s.repo.TemplateFacts(ctx, templateIDs)
	if err != nil {
		return nil, fmt.Errorf("resolve template snapshots: %w", err)
	}
	copies, err := s.repo.InstanceSnapshots(ctx, instanceIDs)
	if err != nil {
		return nil, fmt.Errorf("resolve instance snapshots: %w", err)
	}

	out := &SnapshotResolution{
		Templates: make([]*ItemSnapshot, len(templates)),
		Instances: make([]*ItemSnapshot, len(instanceIDs)),
	}
	reported := map[uuid.UUID]bool{}
	report := func(list *[]uuid.UUID, id uuid.UUID) {
		if !reported[id] {
			reported[id] = true
			*list = append(*list, id)
		}
	}

	for i, req := range templates {
		f, ok := facts[req.TemplateID]
		if !ok {
			report(&out.UnknownTemplateIDs, req.TemplateID)
			continue
		}
		snap := f.ItemSnapshot
		snap.Rarity = templateSnapshotRarity
		snap.Affixes = Affixes{}
		snap.ItemLevel = f.MinItemLevel
		if req.ItemLevel != nil {
			snap.ItemLevel = *req.ItemLevel
		}
		if !snap.representable() {
			report(&out.UnrepresentableIDs, req.TemplateID)
			continue
		}
		out.Templates[i] = &snap
	}

	for i, id := range instanceIDs {
		c, ok := copies[id]
		if !ok {
			report(&out.UnknownInstanceIDs, id)
			continue
		}
		snap := *c
		snap.Affixes = slices.Clone(c.Affixes)
		if !snap.representable() {
			report(&out.UnrepresentableIDs, id)
			continue
		}
		out.Instances[i] = &snap
	}
	return out, nil
}
