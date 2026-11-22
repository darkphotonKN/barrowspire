package character

import (
	"context"
	"errors"
	"maps"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/google/uuid"
)

// spender is a live warrior of level held by member, behind a fake repository
// holding ranks.
func spender(level int32, ranks passivetree.Ranks) (*service, *fakeRepo, *Character) {
	c := &Character{ID: uuid.New(), PlayerID: uuid.New(), ClassID: "warrior", Name: "aldric", Level: level}
	repo := &fakeRepo{get: c, ranks: ranks}
	return NewService(repo, nil), repo, c
}

func spendOf(c *Character, node string, rank int) PassiveSpend {
	return PassiveSpend{MemberID: c.PlayerID, CharacterID: c.ID, NodeID: node, Rank: rank}
}

func TestSpendPassivePoint_TargetAlreadyHeld_NotAppliedNothingWritten(t *testing.T) {
	held := passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1, "warrior.t2a": 2}
	svc, repo, c := spender(5, held)

	got, err := svc.SpendPassivePoint(context.Background(), spendOf(c, "warrior.t2a", 2))

	if err != nil {
		t.Fatalf("spend: %v", err)
	}
	if got.Applied || len(repo.spendWrites) != 0 {
		t.Fatalf("applied %v writes %v, want a no-op", got.Applied, repo.spendWrites)
	}
	if !maps.Equal(got.Ranks, held) {
		t.Fatalf("ranks %v", got.Ranks)
	}
}

func TestSpendPassivePoint_Allowed_WritesTheOneRank(t *testing.T) {
	svc, repo, c := spender(10, passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1, "warrior.t2a": 1})

	got, err := svc.SpendPassivePoint(context.Background(), spendOf(c, "warrior.t2a", 2))

	if err != nil {
		t.Fatalf("spend: %v", err)
	}
	if !got.Applied || len(repo.spendWrites) != 1 || repo.spendWrites[0] != spendOf(c, "warrior.t2a", 2) {
		t.Fatalf("applied %v writes %v, want one write of t2a rank 2", got.Applied, repo.spendWrites)
	}
	if !maps.Equal(got.Ranks, passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1, "warrior.t2a": 2}) {
		t.Fatalf("ranks %v", got.Ranks)
	}
}

func TestSpendPassivePoint_RepeatedSpend_SecondIsANoOp(t *testing.T) {
	svc, repo, c := spender(5, nil)
	spend := spendOf(c, "warrior.r1", 1)

	first, err := svc.SpendPassivePoint(context.Background(), spend)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	second, err := svc.SpendPassivePoint(context.Background(), spend)
	if err != nil {
		t.Fatalf("second: %v", err)
	}

	if !first.Applied || second.Applied || len(repo.spendWrites) != 1 {
		t.Fatalf("applied %v then %v, writes %d, want one write", first.Applied, second.Applied, len(repo.spendWrites))
	}
}

// toM2 is the cheapest path to the ability's link (FS-8RZ51 §Change: Tree v2
// V2), and guardian the cheapest to Guardian, held.
var (
	toM2     = passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1, "warrior.m1": 1, "warrior.m2": 1}
	guardian = passivetree.Ranks{
		"warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1, "warrior.m1": 1, "warrior.m2": 1,
		"warrior.t3": 1, "warrior.m3": 1, "warrior.la1": 1, "warrior.m4": 1, "warrior.t6a": 1,
	}
	upperA = passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1, "warrior.ua1": 1}
)

func TestSpendPassivePoint_Refused_TheRulesCodeAndNothingWritten(t *testing.T) {
	tests := []struct {
		name  string
		level int32
		held  passivetree.Ranks
		node  string
		rank  int
		want  errcode.Code
	}{
		{"another class's node", 5, nil, "mage.r1", 1, errcode.PassiveUnknownNode},
		{"unknown node", 5, nil, "warrior.nope", 1, errcode.PassiveUnknownNode},
		{"a retired node", 5, nil, "warrior.t1a", 1, errcode.PassiveUnknownNode},
		{"rank 2 with none held", 5, nil, "warrior.r1", 2, errcode.PassiveRankOutOfOrder},
		{"rank 2 of a one-rank node", 10, passivetree.Ranks{"warrior.r1": 1}, "warrior.r1", 2, errcode.PassiveMaxRank},
		{"not linked", 10, nil, "warrior.r2", 1, errcode.PassiveTierLocked},
		{"the ability below level 10", 9, toM2, "warrior.t3", 1, errcode.PassiveTierLocked},
		{"no points at level 1", 1, nil, "warrior.r1", 1, errcode.PassiveNoPoints},
		{"the other side", 10, upperA, "warrior.ub1", 1, errcode.PassiveSideTaken},
		{"the other specialization", 20, guardian, "warrior.t6b", 1, errcode.PassiveSideTaken},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, repo, c := spender(tt.level, tt.held)

			_, err := svc.SpendPassivePoint(context.Background(), spendOf(c, tt.node, tt.rank))

			var refusal *errcode.Refusal
			if !errors.As(err, &refusal) || refusal.Code != tt.want {
				t.Fatalf("err = %v, want refusal %s", err, tt.want)
			}
			if len(repo.spendWrites) != 0 {
				t.Fatalf("writes %v, want none", repo.spendWrites)
			}
		})
	}
}

func TestSpendPassivePoint_Malformed_InvalidInputRepositoryNotCalled(t *testing.T) {
	tests := []struct {
		name  string
		spend func(c *Character) PassiveSpend
	}{
		{"no member", func(c *Character) PassiveSpend { s := spendOf(c, "warrior.r1", 1); s.MemberID = uuid.Nil; return s }},
		{"no character", func(c *Character) PassiveSpend { s := spendOf(c, "warrior.r1", 1); s.CharacterID = uuid.Nil; return s }},
		{"no node", func(c *Character) PassiveSpend { return spendOf(c, "", 1) }},
		{"rank 0", func(c *Character) PassiveSpend { return spendOf(c, "warrior.r1", 0) }},
		{"rank below 0", func(c *Character) PassiveSpend { return spendOf(c, "warrior.r1", -1) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, repo, c := spender(5, nil)
			repo.spendErr = errors.New("repository called")

			_, err := svc.SpendPassivePoint(context.Background(), tt.spend(c))

			if !errors.Is(err, commonconstants.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestSpendPassivePoint_NotTheMembersLiveCharacter_NotFound(t *testing.T) {
	svc, repo, c := spender(5, nil)
	repo.spendErr = commonconstants.ErrNotFound

	_, err := svc.SpendPassivePoint(context.Background(), spendOf(c, "warrior.r1", 1))

	if !errors.Is(err, commonconstants.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
