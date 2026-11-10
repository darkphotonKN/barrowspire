package items

import (
	"context"
	"errors"
	"testing"

	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// everyCharacterOwned says yes to every check, for tests about what happens
// once a write is past it.
type everyCharacterOwned struct{}

func (everyCharacterOwned) OwnsCharacter(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return true, nil
}

// characterCheck answers every check with its fields and records what it was
// asked, and when: onCheck runs at the moment of the check.
type characterCheck struct {
	owned      bool
	err        error
	members    []uuid.UUID
	characters []uuid.UUID
	onCheck    func()
}

func (c *characterCheck) OwnsCharacter(_ context.Context, member, character uuid.UUID) (bool, error) {
	c.members = append(c.members, member)
	c.characters = append(c.characters, character)
	if c.onCheck != nil {
		c.onCheck()
	}
	return c.owned, c.err
}

// characterWrites is each write the check guards, called as caller on character.
var characterWrites = []struct {
	name string
	call func(s *service, caller, character uuid.UUID) error
}{
	{"UpdateLoadout", func(s *service, caller, character uuid.UUID) error {
		item := uuid.New()
		return s.UpdateLoadout(context.Background(), caller, &UpdateLoadoutRequest{MemberId: caller, CharacterId: character, Slot: "weapon", ItemInstanceId: &item})
	}},
	{"MoveItemInstance", func(s *service, caller, character uuid.UUID) error {
		_, err := s.MoveItemInstance(context.Background(), caller, &MoveItemInstanceRequest{ItemInstanceID: uuid.New(), Location: LocationBag, CharacterID: character})
		return err
	}},
}

// FS-50MTX R10, R11: a refused write opens no transaction, so no account lock
// is taken and nothing is written. The repository is nil: any call panics.
func TestCharacterWrites_RefusedCheck_OpensNoTransaction(t *testing.T) {
	down := errors.New("connection refused")
	refusals := []struct {
		name  string
		check *characterCheck
		want  error
	}{
		{"not the caller's", &characterCheck{owned: false}, errCharacterNotFound},
		{"character-service unreachable", &characterCheck{err: down}, errCharacterCheckUnavailable},
		{"character-service stalled past the deadline", &characterCheck{err: status.Error(codes.DeadlineExceeded, "context deadline exceeded")}, errCharacterCheckUnavailable},
	}
	for _, write := range characterWrites {
		for _, tt := range refusals {
			t.Run(write.name+"/"+tt.name, func(t *testing.T) {
				opened := false
				svc := &service{characters: tt.check, withTx: func(context.Context, func(*sqlx.Tx) error) error {
					opened = true
					return nil
				}}

				err := write.call(svc, uuid.New(), uuid.New())

				if !errors.Is(err, tt.want) {
					t.Fatalf("err = %v, want %v", err, tt.want)
				}
				if opened {
					t.Error("a refused check opened a transaction")
				}
			})
		}
	}
}

// FS-50MTX R10: the check happens before the transaction, never under the
// account lock, and asks about the caller and the character the write names.
func TestCharacterWrites_AllowedCheck_RunsBeforeTheTransaction(t *testing.T) {
	for _, write := range characterWrites {
		t.Run(write.name, func(t *testing.T) {
			var order []string
			check := &characterCheck{owned: true, onCheck: func() { order = append(order, "check") }}
			svc := &service{characters: check, withTx: func(context.Context, func(*sqlx.Tx) error) error {
				order = append(order, "transaction")
				return nil
			}}
			caller, character := uuid.New(), uuid.New()

			if err := write.call(svc, caller, character); err != nil {
				t.Fatalf("err = %v", err)
			}

			if len(order) != 2 || order[0] != "check" || order[1] != "transaction" {
				t.Fatalf("order = %v, want the check and then the transaction", order)
			}
			if check.members[0] != caller || check.characters[0] != character {
				t.Errorf("checked member %s character %s, want %s and %s", check.members[0], check.characters[0], caller, character)
			}
		})
	}
}

// FS-50MTX R12, R27: reads filter by member and character, and game-service has
// already resolved the character for a checkout, so none of them asks
// character-service.
func TestHandler_ReadsAndCheckout_MakeNoCharacterCheck(t *testing.T) {
	owner := uuid.New()
	ctx := commonauth.EmbedIdentity(context.Background(), commonauth.Identity{MemberID: owner})
	for _, rpc := range ownedRPCs {
		if rpc.name == "UpdateLoadout" {
			continue
		}
		t.Run(rpc.name, func(t *testing.T) {
			check := &characterCheck{err: errors.New("must not be asked")}
			svc := stashService(&stashRepo{owner: owner})
			svc.characters = check

			if err := rpc.call(NewHandler(svc, nil), ctx, owner.String()); err != nil {
				t.Fatalf("err = %v", err)
			}

			if len(check.members) != 0 {
				t.Errorf("made %d character checks, want none", len(check.members))
			}
		})
	}
}

// A caller naming another member is refused by the owner check, before any call
// to character-service.
func TestServiceUpdateLoadout_ForeignMember_MakesNoCharacterCheck(t *testing.T) {
	check := &characterCheck{owned: true}
	svc := &service{characters: check}

	err := svc.UpdateLoadout(context.Background(), uuid.New(), &UpdateLoadoutRequest{MemberId: uuid.New(), CharacterId: uuid.New(), Slot: "weapon"})

	if !errors.Is(err, commonconstants.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(check.members) != 0 {
		t.Errorf("made %d character checks, want none", len(check.members))
	}
}
