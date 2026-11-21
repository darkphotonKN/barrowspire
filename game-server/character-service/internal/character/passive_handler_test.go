package character

import (
	"context"
	"fmt"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ranksOf reads a wire rank list back as Ranks, failing on a repeated node or
// an order other than by node id.
func ranksOf(t *testing.T, wire []*pb.PassiveRank) passivetree.Ranks {
	t.Helper()
	out := passivetree.Ranks{}
	for i, r := range wire {
		if i > 0 && wire[i-1].GetNodeId() >= r.GetNodeId() {
			t.Fatalf("ranks not ordered by node id: %v", wire)
		}
		out[r.GetNodeId()] = int(r.GetRank())
	}
	return out
}

func TestSpendPassivePoint_ParsesAndAnswersAppliedWithEveryRank(t *testing.T) {
	stub := &stubService{spend: &PassiveSpendResult{Applied: true, Ranks: passivetree.Ranks{"warrior.t1b": 1, "warrior.t1a": 2}}}
	client := dial(t, stub)
	member, id := uuid.New(), uuid.New()

	got, err := client.SpendPassivePoint(context.Background(), &pb.SpendPassivePointRequest{
		MemberId: member.String(), CharacterId: id.String(), NodeId: "warrior.t1a", Rank: 2,
	})

	if err != nil {
		t.Fatalf("spend: %v", err)
	}
	if want := (PassiveSpend{MemberID: member, CharacterID: id, NodeID: "warrior.t1a", Rank: 2}); stub.spent != want {
		t.Fatalf("service got %+v, want %+v", stub.spent, want)
	}
	if ranks := ranksOf(t, got.GetPassiveRanks()); !got.GetApplied() || len(ranks) != 2 || ranks["warrior.t1a"] != 2 || ranks["warrior.t1b"] != 1 {
		t.Fatalf("applied %v ranks %v", got.GetApplied(), got.GetPassiveRanks())
	}
}

func TestSpendPassivePoint_AlreadyHeld_OKNotApplied(t *testing.T) {
	client := dial(t, &stubService{spend: &PassiveSpendResult{Applied: false, Ranks: passivetree.Ranks{"warrior.t1a": 2}}})

	got, err := client.SpendPassivePoint(context.Background(), &pb.SpendPassivePointRequest{
		MemberId: uuid.NewString(), CharacterId: uuid.NewString(), NodeId: "warrior.t1a", Rank: 2,
	})

	if err != nil || got.GetApplied() || len(got.GetPassiveRanks()) != 1 {
		t.Fatalf("got %+v, %v; want OK, not applied, the one rank", got, err)
	}
}

// Every rule's code reaches the caller as FailedPrecondition with an ErrorInfo
// naming it, and the message is the code alone, even when the service wrapped
// the refusal.
func TestSpendPassivePoint_Refusal_FailedPreconditionWithTheCode(t *testing.T) {
	codesOfTheRule := []errcode.Code{
		errcode.PassiveUnknownNode, errcode.PassiveRankOutOfOrder, errcode.PassiveMaxRank,
		errcode.PassiveTierLocked, errcode.PassiveNoPoints, errcode.PassiveSpecializationTaken,
	}
	for _, code := range codesOfTheRule {
		t.Run(string(code), func(t *testing.T) {
			client := dial(t, &stubService{err: fmt.Errorf("spend passive point: %w", errcode.Refuse(code))})

			_, err := client.SpendPassivePoint(context.Background(), &pb.SpendPassivePointRequest{
				MemberId: uuid.NewString(), CharacterId: uuid.NewString(), NodeId: "warrior.t1a", Rank: 1,
			})

			st := status.Convert(err)
			got, ok := errcode.RefusalReason(st)
			if st.Code() != codes.FailedPrecondition || !ok || got != code || st.Message() != string(code) {
				t.Fatalf("status %v %q reason %q, want FailedPrecondition %s", st.Code(), st.Message(), got, code)
			}
		})
	}
}

func TestSpendPassivePoint_ErrorCodes(t *testing.T) {
	member, id := uuid.NewString(), uuid.NewString()
	tests := []struct {
		name string
		err  error
		req  *pb.SpendPassivePointRequest
		want codes.Code
	}{
		{"not found", commonconstants.ErrNotFound, &pb.SpendPassivePointRequest{MemberId: member, CharacterId: id, NodeId: "warrior.t1a", Rank: 1}, codes.NotFound},
		{"invalid", commonconstants.ErrInvalidInput, &pb.SpendPassivePointRequest{MemberId: member, CharacterId: id, Rank: 0}, codes.InvalidArgument},
		{"database down", commonconstants.ErrTransient, &pb.SpendPassivePointRequest{MemberId: member, CharacterId: id, NodeId: "warrior.t1a", Rank: 1}, codes.Unavailable},
		{"non-uuid member", nil, &pb.SpendPassivePointRequest{MemberId: "nope", CharacterId: id, NodeId: "warrior.t1a", Rank: 1}, codes.InvalidArgument},
		{"non-uuid character", nil, &pb.SpendPassivePointRequest{MemberId: member, CharacterId: "nope", NodeId: "warrior.t1a", Rank: 1}, codes.InvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := dial(t, &stubService{err: tt.err})

			_, err := client.SpendPassivePoint(context.Background(), tt.req)

			if got := status.Code(err); got != tt.want {
				t.Fatalf("code = %v (%v), want %v", got, err, tt.want)
			}
		})
	}
}

func TestCharacterRead_CarriesHeldRanks_NewCharacterNone(t *testing.T) {
	held := &Character{ID: uuid.New(), Level: 5, PassiveRanks: passivetree.Ranks{"mage.t1a": 1, "mage.t2a": 0}}
	client := dial(t, &stubService{character: held, list: []*Character{held, {ID: uuid.New(), Level: 1}}})
	member := uuid.NewString()

	got, err := client.GetCharacter(context.Background(), &pb.GetCharacterRequest{MemberId: member, CharacterId: held.ID.String()})
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if ranks := ranksOf(t, got.GetPassiveRanks()); len(ranks) != 1 || ranks["mage.t1a"] != 1 {
		t.Fatalf("get ranks %v, want only mage.t1a at 1", got.GetPassiveRanks())
	}

	list, err := client.ListCharacters(context.Background(), &pb.ListCharactersRequest{MemberId: member})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if cs := list.GetCharacters(); len(cs) != 2 || len(cs[0].GetPassiveRanks()) != 1 || len(cs[1].GetPassiveRanks()) != 0 {
		t.Fatalf("list %+v", cs)
	}

	created, err := client.CreateCharacter(context.Background(), &pb.CreateCharacterRequest{MemberId: member, Name: "mira", Class: "mage"})
	if err != nil || len(created.GetPassiveRanks()) != 0 {
		t.Fatalf("created %+v, %v; want no ranks", created, err)
	}
}
