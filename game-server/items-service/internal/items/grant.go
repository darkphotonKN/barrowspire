package items

import (
	"context"
	"errors"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// ErrSnapshotInvalid is a grant entry that cannot be minted: its template is
// unknown, or the snapshot is not representable (FS-1GZGD R19, S2 backstop).
// It reads as ErrInvalidInput too.
var ErrSnapshotInvalid = fmt.Errorf("item snapshot cannot be minted: %w", commonconstants.ErrInvalidInput)

// ErrGrantIDTaken is a grant id already recorded for another member. A grant
// id names one grant of one member, so the call mints nothing and is not
// handed that member's ids.
var ErrGrantIDTaken = errors.New("grant id already granted to another member")

// grantSource is the item_instances source a granted instance carries.
const grantSource = "reward"

// GrantItems mints every line's snapshot Quantity times into member's stash,
// in one transaction, all or nothing (FS-1GZGD R18-R20, ADR-0044). Under the
// member's account lock, the grant id is recorded first, so the primary key
// decides a repeat: a known id mints nothing and answers the first grant's
// ids, AlreadyGranted, whatever the stash holds now. Then every snapshot must
// be mintable (ErrSnapshotInvalid) and the stash must take the whole grant
// (STASH_FULL); either refusal rolls the grant id back with everything else,
// so the same grant can be retried later.
func (s *service) GrantItems(ctx context.Context, member uuid.UUID, grantID string, lines []GrantLine) (*GrantResult, error) {
	var result *GrantResult
	err := s.withTx(ctx, func(tx *sqlx.Tx) error {
		if err := s.repo.LockAccountTx(ctx, tx, member); err != nil {
			return err
		}

		ids := make([]uuid.UUID, slotCount(lines))
		for i := range ids {
			ids[i] = uuid.New()
		}
		recorded, err := s.repo.InsertItemGrantTx(ctx, tx, &ItemGrant{GrantID: grantID, MemberID: member, ItemIDs: ids})
		if err != nil {
			return err
		}
		if !recorded {
			prior, err := s.priorGrant(ctx, tx, grantID, member)
			if err != nil {
				return err
			}
			result = prior
			return nil
		}

		instances, err := s.instancesFromSnapshots(ctx, tx, member, lines, ids)
		if err != nil {
			return err
		}

		stashed, err := s.repo.CountUnwornAtTx(ctx, tx, member, LocationStash)
		if err != nil {
			return err
		}
		if stashed+len(instances) > StashCapacity {
			return errcode.Refuse(errcode.StashFull)
		}

		if err := s.repo.InsertItemInstancesAtTx(ctx, tx, instances, LocationStash); err != nil {
			// the database's own checks (an armor slot, a vanished template)
			// are the last word on what a snapshot can be
			if errors.Is(err, commonconstants.ErrConstraintViolation) {
				return fmt.Errorf("%w: %w", ErrSnapshotInvalid, err)
			}
			return err
		}
		result = &GrantResult{ItemIDs: ids}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("grant items %q to %s: %w", grantID, member, err)
	}
	return result, nil
}

// priorGrant answers a grant id that is already recorded: the first grant's
// ids when it was member's.
func (s *service) priorGrant(ctx context.Context, tx *sqlx.Tx, grantID string, member uuid.UUID) (*GrantResult, error) {
	prior, err := s.repo.ItemGrantTx(ctx, tx, grantID)
	if err != nil {
		return nil, err
	}
	if prior == nil {
		// the conflicting grant was there a statement ago; a retry reads it
		return nil, fmt.Errorf("grant %q conflicted but cannot be read: %w", grantID, commonconstants.ErrTransient)
	}
	if prior.MemberID != member {
		return nil, ErrGrantIDTaken
	}
	return &GrantResult{ItemIDs: prior.ItemIDs, AlreadyGranted: true}, nil
}

// slotCount is how many stash cells a grant takes: one per instance.
func slotCount(lines []GrantLine) int {
	n := 0
	for _, line := range lines {
		n += line.Quantity
	}
	return n
}

// instancesFromSnapshots builds the grant's instances, ids[i] for the i-th,
// lines expanded in order. Each is its snapshot exactly, owned by member and
// AVAILABLE; a snapshot whose template is unknown or of another item type, or
// that is not mintable, is ErrSnapshotInvalid. No drop rule is applied
// (FS-1GZGD A1).
func (s *service) instancesFromSnapshots(ctx context.Context, tx *sqlx.Tx, member uuid.UUID, lines []GrantLine, ids []uuid.UUID) ([]*ItemInstance, error) {
	templateIDs := make([]uuid.UUID, 0, len(lines))
	for _, line := range lines {
		templateIDs = append(templateIDs, line.Snapshot.TemplateID)
	}
	itemTypes, err := s.repo.TemplateItemTypesTx(ctx, tx, templateIDs)
	if err != nil {
		return nil, err
	}
	rarities, err := s.repo.RarityIDsTx(ctx, tx)
	if err != nil {
		return nil, err
	}

	instances := make([]*ItemInstance, 0, len(ids))
	for _, line := range lines {
		snap := line.Snapshot
		itemType, known := itemTypes[snap.TemplateID]
		switch {
		case !known:
			return nil, fmt.Errorf("template %s unknown: %w", snap.TemplateID, ErrSnapshotInvalid)
		case itemType != snap.ItemType:
			return nil, fmt.Errorf("template %s is a %q, snapshot a %q: %w", snap.TemplateID, itemType, snap.ItemType, ErrSnapshotInvalid)
		case !snap.mintable():
			return nil, fmt.Errorf("snapshot of template %s: %w", snap.TemplateID, ErrSnapshotInvalid)
		}
		var rarityID *uuid.UUID
		if snap.Rarity != "" {
			id, ok := rarities[snap.Rarity]
			if !ok {
				return nil, fmt.Errorf("rarity %q unknown: %w", snap.Rarity, ErrSnapshotInvalid)
			}
			rarityID = &id
		}

		for range line.Quantity {
			instances = append(instances, snap.instance(ids[len(instances)], member, rarityID))
		}
	}
	return instances, nil
}
