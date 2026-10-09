package items

import (
	"context"
	"errors"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// extractionRepo stubs the two writes an extraction makes. The embedded
// interface is nil: anything else the service reaches for panics the test.
type extractionRepo struct {
	Repository
	upsertErr  error
	loadoutErr error
	upserted   []*ItemInstance
}

func (r *extractionRepo) BatchUpsertItemInstances(ctx context.Context, tx *sqlx.Tx, items []*ItemInstance) error {
	r.upserted = append(r.upserted, items...)
	return r.upsertErr
}

func (r *extractionRepo) UpsertPlayerLoadoutTx(ctx context.Context, tx *sqlx.Tx, req *UpsertPlayerLoadoutRequest) error {
	return r.loadoutErr
}

// runInline runs the transaction body without a database.
func runInline(ctx context.Context, fn func(tx *sqlx.Tx) error) error { return fn(nil) }

func extractedEvent(items ...*pb.Item) *pb.ItemsExtractedEvent {
	return &pb.ItemsExtractedEvent{
		EventId: uuid.NewString(),
		PlayerItems: []*pb.PlayerItems{{
			MemberId:  uuid.NewString(),
			Equipment: &pb.Equipment{},
			Inventory: items,
		}},
	}
}

func potion() *pb.Item {
	return &pb.Item{TemplateId: uuid.NewString(), ItemType: "consumable", Name: "Lesser Heal Potion", HealingAmount: 10}
}

// A batch that fails to store is returned, so the consumer requeues or
// dead-letters the event instead of acking lost loot; a per-item skip is not a
// failure (FS-4R9M9 R49, R50).
func TestProcessItemsExtracted_Outcome(t *testing.T) {
	commitFailed := errors.New("connection reset")

	tests := []struct {
		name    string
		repo    *extractionRepo
		withTx  func(ctx context.Context, fn func(tx *sqlx.Tx) error) error
		event   *pb.ItemsExtractedEvent
		wantErr error
		stored  int
	}{
		{
			name:   "stored",
			repo:   &extractionRepo{},
			event:  extractedEvent(potion()),
			stored: 1,
		},
		{
			name: "an item without a template is skipped, the rest stored",
			repo: &extractionRepo{},
			event: extractedEvent(potion(),
				&pb.Item{ItemType: "weapon", Name: "Nameless"}),
			stored: 1,
		},
		{
			name:    "a row the store refuses fails the batch",
			repo:    &extractionRepo{upsertErr: commonconstants.ErrConstraintViolation},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrConstraintViolation,
			stored:  1,
		},
		{
			name:    "a transient store failure stays transient",
			repo:    &extractionRepo{upsertErr: commonconstants.ErrTransient},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrTransient,
			stored:  1,
		},
		{
			name:    "a loadout write failure fails the batch",
			repo:    &extractionRepo{loadoutErr: commonconstants.ErrLockUnavailable},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrLockUnavailable,
			stored:  1,
		},
		{
			name: "the transaction failing around a good batch is transient",
			repo: &extractionRepo{},
			withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
				if err := fn(nil); err != nil {
					return err
				}
				return commitFailed
			},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrTransient,
			stored:  1,
		},
		{
			name: "the transaction failing to begin is transient",
			repo: &extractionRepo{},
			withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
				return commitFailed
			},
			event:   extractedEvent(potion()),
			wantErr: commonconstants.ErrTransient,
		},
		{
			name: "a malformed member id fails the event",
			repo: &extractionRepo{},
			event: &pb.ItemsExtractedEvent{PlayerItems: []*pb.PlayerItems{{
				MemberId: "not-a-uuid", Equipment: &pb.Equipment{}, Inventory: []*pb.Item{potion()},
			}}},
			wantErr: commonconstants.ErrUUIDCouldNotBeParsed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withTx := tt.withTx
			if withTx == nil {
				withTx = runInline
			}
			svc := &service{repo: tt.repo, withTx: withTx}

			err := svc.ProcessItemsExtracted(context.Background(), tt.event)

			switch {
			case tt.wantErr == nil && err != nil:
				t.Fatalf("unexpected error: %v", err)
			case tt.wantErr != nil && !errors.Is(err, tt.wantErr):
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if len(tt.repo.upserted) != tt.stored {
				t.Errorf("stored %d rows, want %d", len(tt.repo.upserted), tt.stored)
			}
		})
	}
}

// A player with no equipment extracts their satchel: nil equipment means no
// equipped items, never a panic inside the transaction (FS-4R9M9 R49, R50).
func TestProcessItemsExtracted_NilEquipment_StoresSatchel(t *testing.T) {
	repo := &extractionRepo{}
	svc := &service{repo: repo, withTx: runInline}
	event := extractedEvent(potion(), potion())
	event.PlayerItems[0].Equipment = nil

	if err := svc.ProcessItemsExtracted(context.Background(), event); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.upserted) != 2 {
		t.Fatalf("stored %d rows, want the 2 satchel items", len(repo.upserted))
	}
}

// Nil equipment maps to no equipped items and an empty loadout for the member.
func TestMapProtoEquipmentToItemInstances_NilEquipment(t *testing.T) {
	member := uuid.New()

	instances, loadout, err := (&service{}).MapProtoEquipmentToItemInstances(member, nil)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 0 {
		t.Fatalf("mapped %d equipped items from nil equipment", len(instances))
	}
	if loadout == nil || loadout.MemberID != member || loadout.WeaponInstanceID != nil || loadout.ChestInstanceID != nil {
		t.Fatalf("loadout %+v, want an empty loadout for %s", loadout, member)
	}
}
