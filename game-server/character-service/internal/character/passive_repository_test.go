package character

import (
	"context"
	"errors"
	"maps"
	"os"
	"sync"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
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
	c := leveled(t, repo, member, 6)
	svc := NewService(repo, nil)
	spend := PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: "warrior.r1", Rank: 1}

	first, err := svc.SpendPassivePoint(ctx, spend)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	written := storedRanks(t, repo, c.ID)
	if !first.Applied || len(written) != 1 || written["warrior.r1"].Rank != 1 {
		t.Fatalf("applied %v stored %v, want r1 at 1", first.Applied, written)
	}

	second, err := svc.SpendPassivePoint(ctx, spend)
	if err != nil {
		t.Fatalf("repeat: %v", err)
	}
	again := storedRanks(t, repo, c.ID)
	if second.Applied || !maps.Equal(again, written) || !maps.Equal(second.Ranks, passivetree.Ranks{"warrior.r1": 1}) {
		t.Fatalf("repeat applied %v stored %v ranks %v, want a no-op", second.Applied, again, second.Ranks)
	}

	// a kicker's next rank is an update of the same row
	for _, s := range []PassiveSpend{
		{MemberID: member, CharacterID: c.ID, NodeID: "warrior.r2", Rank: 1},
		{MemberID: member, CharacterID: c.ID, NodeID: "warrior.ua1", Rank: 1},
		{MemberID: member, CharacterID: c.ID, NodeID: "warrior.t2a", Rank: 1},
	} {
		if _, err := svc.SpendPassivePoint(ctx, s); err != nil {
			t.Fatalf("spend %+v: %v", s, err)
		}
	}
	if third, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: "warrior.t2a", Rank: 2}); err != nil || !third.Applied {
		t.Fatalf("rank 2 = %+v, %v", third, err)
	}
	if stored := storedRanks(t, repo, c.ID); len(stored) != 4 || stored["warrior.t2a"].Rank != 2 {
		t.Fatalf("after rank 2 stored %v", stored)
	}
}

// Two spends that together need two points, at level 5 with three of its four
// held: the row lock serialises them, so one lands and the other sees it and
// is refused.
func TestRepositorySpendPassivePoint_ConcurrentSpendsPastThePoints_OneLands(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c := leveled(t, repo, member, 5)
	svc := NewService(repo, nil)
	for _, node := range []string{"warrior.r1", "warrior.r2", "warrior.ua1"} {
		if _, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: node, Rank: 1}); err != nil {
			t.Fatalf("spend %s: %v", node, err)
		}
	}

	// both linked from ua1, neither locking the other
	errs := concurrentSpends(svc, member, c, "warrior.t2a", "warrior.m1")

	oneLandsOneRefused(t, errs, errcode.PassiveNoPoints)
	if stored := storedRanks(t, repo, c.ID); len(stored) != 4 {
		t.Fatalf("stored %v, want one rank more", stored)
	}
}

func TestRepositorySpendPassivePoint_Refused_NothingWritten(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c := leveled(t, repo, member, 1)
	svc := NewService(repo, nil)

	_, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: "warrior.r1", Rank: 1})

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

			_, err := repo.SpendPassivePoint(ctx, PassiveSpend{MemberID: tt.member, CharacterID: tt.id, NodeID: "warrior.r1", Rank: 1},
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
		{MemberID: member, CharacterID: spent.ID, NodeID: "warrior.r1", Rank: 1},
		{MemberID: member, CharacterID: spent.ID, NodeID: "warrior.r2", Rank: 1},
	} {
		if _, err := svc.SpendPassivePoint(ctx, s); err != nil {
			t.Fatalf("spend %+v: %v", s, err)
		}
	}
	want := passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1}

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

// concurrentSpends spends each node for c at rank 1 at once and returns each
// call's error, in nodes' order.
func concurrentSpends(svc *service, member uuid.UUID, c *Character, nodes ...string) []error {
	errs := make([]error, len(nodes))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, node := range nodes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, errs[i] = svc.SpendPassivePoint(context.Background(), PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: node, Rank: 1})
		}()
	}
	close(start)
	wg.Wait()
	return errs
}

// oneLandsOneRefused fails t unless exactly one of errs is nil and the other
// is the refusal code.
func oneLandsOneRefused(t *testing.T, errs []error, code errcode.Code) {
	t.Helper()
	landed, refused := 0, 0
	for _, err := range errs {
		var refusal *errcode.Refusal
		switch {
		case err == nil:
			landed++
		case errors.As(err, &refusal) && refusal.Code == code:
			refused++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if landed != 1 || refused != 1 {
		t.Fatalf("landed %d refused %d, want 1 / 1 %s", landed, refused, code)
	}
}

// Acceptance (FS-8RZ51 §Change: Tree v2, §Edge States "Two clients racing"):
// two concurrent spends of ua1 and ub1 for one character, both allowed against
// a record holding neither. The row lock decides them: exactly one row lands,
// and the other call reads it under the lock and is refused
// PASSIVE_SIDE_TAKEN, writing nothing.
func TestRepositorySpendPassivePoint_ConcurrentSpendsOnOppositeSides_OneLandsTheOtherIsSideTaken(t *testing.T) {
	repo, cleanup := testRepo(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	c := leveled(t, repo, member, 6)
	svc := NewService(repo, nil)
	for _, node := range []string{"warrior.r1", "warrior.r2"} {
		if _, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: c.ID, NodeID: node, Rank: 1}); err != nil {
			t.Fatalf("spend %s: %v", node, err)
		}
	}

	errs := concurrentSpends(svc, member, c, "warrior.ua1", "warrior.ub1")

	oneLandsOneRefused(t, errs, errcode.PassiveSideTaken)
	stored := storedRanks(t, repo, c.ID)
	_, upperA := stored["warrior.ua1"]
	_, upperB := stored["warrior.ub1"]
	if len(stored) != 3 || upperA == upperB {
		t.Fatalf("stored %v, want r1, r2 and exactly one of ua1 and ub1", stored)
	}
}

// clearRanksVersion is the migration that voids every spend (FS-8RZ51
// §Change: Tree v2 V20).
const clearRanksVersion = 5

// migrator is the character migrations against CHARACTER_TEST_DSN, put back at
// the latest version when the test ends.
func migrator(t *testing.T) *migrate.Migrate {
	t.Helper()
	m, err := migrate.New("file://../../migrations", os.Getenv("CHARACTER_TEST_DSN"))
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() {
		if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			t.Errorf("back up: %v", err)
		}
		_, _ = m.Close()
	})
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		t.Fatalf("up: %v", err)
	}
	return m
}

// guardianPath is a warrior's cheapest path to Guardian, in spend order.
var guardianPath = []string{
	"warrior.r1", "warrior.r2", "warrior.ua1", "warrior.m1", "warrior.m2",
	"warrior.t3", "warrior.m3", "warrior.la1", "warrior.m4", "warrior.t6a",
}

// Acceptance (V20) "After 000005 up, passive_ranks is empty. A character
// reads no ranks and no specialization, and its unspent points are
// earned(level). 000005 down changes nothing." The test migrates the database
// itself, like TestNameCheckMigration_UpDownUp, and the wipe takes every row in
// passive_ranks, not only its own.
func TestClearPassiveRanksMigration_UpRefundsEveryCharacter_DownChangesNothing(t *testing.T) {
	repo, cleanup := testRepo(t)
	m := migrator(t)
	ctx := context.Background()
	member := uuid.New()
	cleanup(member)
	svc := NewService(repo, nil)

	if err := m.Migrate(clearRanksVersion - 1); err != nil {
		t.Fatalf("down to %d: %v", clearRanksVersion-1, err)
	}
	specced := leveled(t, repo, member, 20)
	for _, node := range guardianPath {
		if _, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: specced.ID, NodeID: node, Rank: 1}); err != nil {
			t.Fatalf("spend %s: %v", node, err)
		}
	}
	stray := leveled(t, repo, member, 6)
	// a row an older tree wrote: a retired filler at 2
	if _, err := repo.db.Exec(`INSERT INTO passive_ranks (character_id, node_id, rank) VALUES ($1, 'warrior.t1a', 2)`, stray.ID); err != nil {
		t.Fatalf("seed a retired rank: %v", err)
	}
	if got, err := svc.GetCharacter(ctx, member, specced.ID); err != nil || got.Specialization != passivetree.Guardian {
		t.Fatalf("before the wipe %+v, %v; want Guardian", got, err)
	}

	if err := m.Migrate(clearRanksVersion); err != nil {
		t.Fatalf("up to %d: %v", clearRanksVersion, err)
	}

	var left int
	if err := repo.db.Get(&left, `SELECT COUNT(*) FROM passive_ranks`); err != nil || left != 0 {
		t.Fatalf("passive_ranks holds %d rows (%v), want none", left, err)
	}
	for _, c := range []*Character{specced, stray} {
		got, err := svc.GetCharacter(ctx, member, c.ID)
		if err != nil {
			t.Fatalf("read %s: %v", c.ID, err)
		}
		if len(got.PassiveRanks) != 0 || got.Specialization != "" {
			t.Fatalf("level %d reads ranks %v specialization %q, want none", c.Level, got.PassiveRanks, got.Specialization)
		}
		if unspent := passivetree.Unspent(got.Level, got.PassiveRanks); unspent != passivetree.Earned(got.Level) {
			t.Fatalf("level %d unspent %d, want earned %d", got.Level, unspent, passivetree.Earned(got.Level))
		}
	}

	// a spend under the new tree, then the down: it stays
	if _, err := svc.SpendPassivePoint(ctx, PassiveSpend{MemberID: member, CharacterID: stray.ID, NodeID: "warrior.r1", Rank: 1}); err != nil {
		t.Fatalf("spend after the wipe: %v", err)
	}
	before := storedRanks(t, repo, stray.ID)

	if err := m.Migrate(clearRanksVersion - 1); err != nil {
		t.Fatalf("down to %d: %v", clearRanksVersion-1, err)
	}

	if after := storedRanks(t, repo, stray.ID); !maps.Equal(after, before) {
		t.Fatalf("after down stored %v, want %v unchanged", after, before)
	}
}
