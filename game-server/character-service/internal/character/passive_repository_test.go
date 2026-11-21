package character

import (
	"context"
	"errors"
	"maps"
	"sync"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/google/uuid"
)

// The passive spend against Postgres (FS-8RZ51 §C). Same opt-in as
// repository_test.go: CHARACTER_TEST_DSN, a migrated character DB.

// leveled is a new live warrior of member's, set to level.
func leveled(t *testing.T, repo *repository, member uuid.UUID, level int32) *Character {
	t.Helper()
	c, err := repo.Create(context.Background(), newCharacter(member, uniqueName("tree")))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := repo.db.Exec(`UPDATE characters SET level = $2 WHERE id = $1`, c.ID, level); err != nil {
		t.Fatalf("set level: %v", err)
	}
	c.Level = level
	return c
}

type storedRank struct {
	NodeID    string    `db:"node_id"`
	Rank      int       `db:"rank"`
	UpdatedAt time.Time `db:"updated_at"`
}

func storedRanks(t *testing.T, repo *repository, characterID uuid.UUID) map[string]storedRank {
	t.Helper()
	rows := []storedRank{}
	if err := repo.db.Select(&rows, `SELECT node_id, rank, updated_at FROM passive_ranks WHERE character_id = $1`, characterID); err != nil {
		t.Fatalf("read ranks: %v", err)
	}
	out := map[string]storedRank{}
	for _, r := range rows {
		out[r.NodeID] = r
	}
	return out
}

func TestRepositorySpendPassivePoint_WritesOneRank_RepeatWritesNothing(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c := leveled(t, repo, member, 5)
	svc := NewService(repo, nil)
	spend := PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: "warrior.t1a", Rank: 1}

	first, err := svc.SpendPassivePoint(ctx, spend)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	written := storedRanks(t, repo, c.ID)
	if !first.Applied || len(written) != 1 || written["warrior.t1a"].Rank != 1 {
		t.Fatalf("applied %v stored %v, want t1a at 1", first.Applied, written)
	}

	second, err := svc.SpendPassivePoint(ctx, spend)
	if err != nil {
		t.Fatalf("repeat: %v", err)
	}
	again := storedRanks(t, repo, c.ID)
	if second.Applied || !maps.Equal(again, written) || !maps.Equal(second.Ranks, passivetree.Ranks{"warrior.t1a": 1}) {
		t.Fatalf("repeat applied %v stored %v ranks %v, want a no-op", second.Applied, again, second.Ranks)
	}

	// the next rank is an update of the same row
	if third, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: "warrior.t1a", Rank: 2}); err != nil || !third.Applied {
		t.Fatalf("rank 2 = %+v, %v", third, err)
	}
	if stored := storedRanks(t, repo, c.ID); len(stored) != 1 || stored["warrior.t1a"].Rank != 2 {
		t.Fatalf("after rank 2 stored %v", stored)
	}
}

// Two spends that together need two points, at level 2 (one point): the row
// lock serialises them, so one lands and the other sees it and is refused.
func TestRepositorySpendPassivePoint_ConcurrentSpendsPastThePoints_OneLands(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c := leveled(t, repo, member, 2)
	svc := NewService(repo, nil)

	nodes := []string{"warrior.t1a", "warrior.t1b"}
	errs := make([]error, len(nodes))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, node := range nodes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, errs[i] = svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: node, Rank: 1})
		}()
	}
	close(start)
	wg.Wait()

	landed, refused := 0, 0
	for _, err := range errs {
		var refusal *errcode.Refusal
		switch {
		case err == nil:
			landed++
		case errors.As(err, &refusal) && refusal.Code == errcode.PassiveNoPoints:
			refused++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if landed != 1 || refused != 1 {
		t.Fatalf("landed %d refused %d, want 1 / 1", landed, refused)
	}
	if stored := storedRanks(t, repo, c.ID); len(stored) != 1 {
		t.Fatalf("stored %v, want one rank", stored)
	}
}

func TestRepositorySpendPassivePoint_Refused_NothingWritten(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c := leveled(t, repo, member, 1)
	svc := NewService(repo, nil)

	_, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: "warrior.t1a", Rank: 1})

	var refusal *errcode.Refusal
	if !errors.As(err, &refusal) || refusal.Code != errcode.PassiveNoPoints {
		t.Fatalf("err = %v, want PASSIVE_NO_POINTS", err)
	}
	if stored := storedRanks(t, repo, c.ID); len(stored) != 0 {
		t.Fatalf("stored %v, want none", stored)
	}
}

func TestRepositorySpendPassivePoint_NotTheMembersLiveCharacter_NotFound(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	owner, other := uuid.New(), uuid.New()
	cleanup(owner, other)
	live := leveled(t, repo, owner, 5)
	deleted := leveled(t, repo, owner, 5)
	if err := repo.SoftDelete(ctx, owner, deleted.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	tests := []struct {
		name   string
		member uuid.UUID
		id     uuid.UUID
	}{
		{"another member's", other, live.ID},
		{"deleted", owner, deleted.ID},
		{"unknown", owner, uuid.New()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			decided := false

			_, err := repo.SpendPassivePoint(ctx, PassiveSpend{MemberID: tt.member, CharacterID: tt.id, NodeID: "warrior.t1a", Rank: 1},
				func(*Character) (bool, error) { decided = true; return true, nil })

			if !errors.Is(err, commonconstants.ErrNotFound) || decided {
				t.Fatalf("err = %v decided %v, want ErrNotFound undecided", err, decided)
			}
		})
	}
	for _, id := range []uuid.UUID{live.ID, deleted.ID} {
		if stored := storedRanks(t, repo, id); len(stored) != 0 {
			t.Fatalf("stored %v for %s, want none", stored, id)
		}
	}
}

// Get and List carry the held ranks; a new character holds none. A deleted
// character keeps its rows but is not read (R15).
func TestRepositoryRead_CarriesHeldRanks(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	svc := NewService(repo, nil)
	spent := leveled(t, repo, member, 5)
	fresh := leveled(t, repo, member, 5)
	for _, s := range []PassiveSpend{
		{MemberID: member, CharacterID: spent.ID, NodeID: "warrior.t1a", Rank: 1},
		{MemberID: member, CharacterID: spent.ID, NodeID: "warrior.t1a", Rank: 2},
		{MemberID: member, CharacterID: spent.ID, NodeID: "warrior.t1b", Rank: 1},
	} {
		if _, err := svc.SpendPassivePoint(ctx, s); err != nil {
			t.Fatalf("spend %+v: %v", s, err)
		}
	}
	want := passivetree.Ranks{"warrior.t1a": 2, "warrior.t1b": 1}

	got, err := repo.GetByPlayer(ctx, member, spent.ID)
	if err != nil || !maps.Equal(got.PassiveRanks, want) {
		t.Fatalf("get ranks %v, %v; want %v", got, err, want)
	}
	if got, err := repo.GetByPlayer(ctx, member, fresh.ID); err != nil || got.PassiveRanks == nil || len(got.PassiveRanks) != 0 {
		t.Fatalf("fresh ranks %v, %v; want none", got, err)
	}

	list, err := repo.ListByPlayer(ctx, member)
	if err != nil || len(list) != 2 {
		t.Fatalf("list %v, %v", list, err)
	}
	if !maps.Equal(list[0].PassiveRanks, want) || list[1].PassiveRanks == nil || len(list[1].PassiveRanks) != 0 {
		t.Fatalf("list ranks %v / %v", list[0].PassiveRanks, list[1].PassiveRanks)
	}

	if err := repo.SoftDelete(ctx, member, spent.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if stored := storedRanks(t, repo, spent.ID); len(stored) != 2 {
		t.Fatalf("after delete stored %v, want the ranks kept", stored)
	}
	if _, err := repo.GetByPlayer(ctx, member, spent.ID); !errors.Is(err, commonconstants.ErrNotFound) {
		t.Fatalf("get deleted err = %v, want ErrNotFound", err)
	}
}
