package stats

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// txStore stands in for the database: writes made inside a transaction are
// staged and only become visible once that transaction commits, so a test can
// see exactly what a rolled-back event left behind (nothing).
type txStore struct {
	staged, committed []string
	stagedSeen        []inboxKey
	seen              map[inboxKey]bool
	commits           int
	commitErr         error // the transaction itself fails (begin or commit) after fn succeeds
}

type inboxKey struct {
	id        uuid.UUID
	eventType string
}

func newTxStore() *txStore { return &txStore{seen: map[inboxKey]bool{}} }

func (s *txStore) withTx(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
	s.staged, s.stagedSeen = nil, nil
	if err := fn(nil); err != nil {
		return err
	}
	if s.commitErr != nil {
		return s.commitErr
	}
	s.committed = append(s.committed, s.staged...)
	for _, k := range s.stagedSeen {
		s.seen[k] = true
	}
	s.commits++
	return nil
}

// storeInbox is the inbox on the fake store.
type storeInbox struct {
	store *txStore
	err   error
}

func (i *storeInbox) MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error) {
	if i.err != nil {
		return false, i.err
	}
	k := inboxKey{eventID, eventType}
	if i.store.seen[k] {
		return false, nil
	}
	i.store.stagedSeen = append(i.store.stagedSeen, k)
	return true, nil
}

// storeRepo records each per-player write on the fake store; failHistoryFor
// makes one player's match-history write fail.
type storeRepo struct {
	mockRepo
	store          *txStore
	failHistoryFor string
	failErr        error
}

func (r *storeRepo) GetPlayerMatchStatsTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*PlayerMatchStats, error) {
	return &PlayerMatchStats{MemberID: memberID}, nil
}

func (r *storeRepo) UpsertPlayerMatchStatsTx(ctx context.Context, tx *sqlx.Tx, params *UpdateStatsParams) (*PlayerMatchStats, error) {
	r.store.staged = append(r.store.staged, "stats:"+params.MemberID.String())
	return nil, nil
}

func (r *storeRepo) UpsertPlayerRankingStatsTx(ctx context.Context, tx *sqlx.Tx, params *UpdatePlayerRankingsParams) (*PlayerRankingStats, error) {
	r.store.staged = append(r.store.staged, "ranking:"+params.MemberID.String())
	return nil, nil
}

func (r *storeRepo) CreateMatchHistoryTx(ctx context.Context, tx *sqlx.Tx, history *MatchHistory) error {
	if history.MemberID.String() == r.failHistoryFor {
		return r.failErr
	}
	r.store.staged = append(r.store.staged, "history:"+history.MemberID.String())
	return nil
}

// countingCache counts leaderboard cache-version bumps and remembers the
// deadline the last one ran under.
type countingCache struct {
	cache.Cache
	incrs       int
	err         error
	hadDeadline bool
	deadline    time.Time
}

func (c *countingCache) Incr(ctx context.Context, key string) (int64, error) {
	c.incrs++
	c.deadline, c.hadDeadline = ctx.Deadline()
	if c.err != nil {
		return 0, c.err
	}
	return int64(c.incrs), nil
}

const (
	playerA = "550e8400-e29b-41d4-a716-446655440001"
	playerB = "550e8400-e29b-41d4-a716-446655440002"
)

func twoPlayerMatch() *pb.MatchEndedEvent {
	return &pb.MatchEndedEvent{
		SessionId: "550e8400-e29b-41d4-a716-446655440000",
		Players: []*pb.PlayerMatchResult{
			{MemberId: playerA, Username: "a", Win: true, Kills: 3},
			{MemberId: playerB, Username: "b", Deaths: 1},
		},
	}
}

var allPlayerWrites = []string{
	"stats:" + playerA, "ranking:" + playerA, "history:" + playerA,
	"stats:" + playerB, "ranking:" + playerB, "history:" + playerB,
}

type matchFixture struct {
	store *txStore
	repo  *storeRepo
	inbox *storeInbox
	cache *countingCache
	svc   *service
}

func newMatchFixture() *matchFixture {
	store := newTxStore()
	f := &matchFixture{
		store: store,
		repo:  &storeRepo{store: store},
		inbox: &storeInbox{store: store},
		cache: &countingCache{},
	}
	f.svc = &service{repo: f.repo, inbox: f.inbox, withTx: store.withTx, cache: f.cache}
	return f
}

func assertWrites(t *testing.T, got, want []string) {
	t.Helper()
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("committed writes %v, want %v", got, want)
	}
}

// A new event writes every player's stats, leaderboard and history in one
// commit with its inbox row, then bumps the leaderboard cache version once.
func TestProcessMatchCompleted_NewEvent_AllPlayersInOneCommit(t *testing.T) {
	f := newMatchFixture()
	eventID := uuid.New()

	err := f.svc.ProcessMatchCompleted(context.Background(), eventID, commonconstants.GameMatchEnded, twoPlayerMatch())

	if err != nil {
		t.Fatalf("process: %v", err)
	}
	assertWrites(t, f.store.committed, allPlayerWrites)
	if f.store.commits != 1 {
		t.Fatalf("%d commits, want 1", f.store.commits)
	}
	if !f.store.seen[inboxKey{eventID, commonconstants.GameMatchEnded}] {
		t.Fatalf("inbox %v has no %s row for %s", f.store.seen, commonconstants.GameMatchEnded, eventID)
	}
	if f.cache.incrs != 1 {
		t.Fatalf("cache version bumped %d times, want 1", f.cache.incrs)
	}
}

// A redelivery of an event already applied writes nothing, does not bump the
// cache, and says so with ErrAlreadyProcessed so the consumer acks it.
func TestProcessMatchCompleted_Duplicate_NoWritesNoBump(t *testing.T) {
	f := newMatchFixture()
	eventID := uuid.New()
	ctx := context.Background()

	if err := f.svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, twoPlayerMatch()); err != nil {
		t.Fatalf("first delivery: %v", err)
	}
	err := f.svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, twoPlayerMatch())

	if !errors.Is(err, commonconstants.ErrAlreadyProcessed) {
		t.Fatalf("second delivery err = %v, want ErrAlreadyProcessed", err)
	}
	assertWrites(t, f.store.committed, allPlayerWrites)
	if f.cache.incrs != 1 {
		t.Fatalf("cache version bumped %d times, want 1", f.cache.incrs)
	}
}

// One player failing fails the whole event: nothing is committed for either
// player, no inbox row, no cache bump, and the error is returned for the
// consumer to settle. Its retry under the same id then applies every player
// exactly once.
func TestProcessMatchCompleted_SecondPlayerFails_NothingCommitted_RetryAppliesOnce(t *testing.T) {
	fk := fmt.Errorf("stats repo: create match history: %w: %w", commonconstants.ErrConstraintViolation, &pq.Error{Code: "23503"})
	tests := []struct {
		name    string
		failErr error
		check   func(t *testing.T, err error)
	}{
		{"transient", fmt.Errorf("store: %w", commonconstants.ErrTransient), func(t *testing.T, err error) {
			if !errors.Is(err, commonconstants.ErrTransient) {
				t.Fatalf("err = %v, want ErrTransient", err)
			}
		}},
		{"foreign key keeps its SQLSTATE", fk, func(t *testing.T, err error) {
			var pqErr *pq.Error
			if !errors.As(err, &pqErr) || pqErr.Code != "23503" {
				t.Fatalf("err = %v lost its 23503", err)
			}
			if o := classify(err); o.disposition != retryBounded {
				t.Fatalf("classified %v, want %v", o.disposition, retryBounded)
			}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newMatchFixture()
			f.repo.failHistoryFor, f.repo.failErr = playerB, tt.failErr
			eventID := uuid.New()
			ctx := context.Background()

			err := f.svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, twoPlayerMatch())

			tt.check(t, err)
			assertWrites(t, f.store.committed, nil)
			if len(f.store.seen) != 0 || f.cache.incrs != 0 {
				t.Fatalf("inbox %v, cache bumps %d, want neither", f.store.seen, f.cache.incrs)
			}

			f.repo.failHistoryFor = ""
			if err := f.svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, twoPlayerMatch()); err != nil {
				t.Fatalf("retry: %v", err)
			}
			assertWrites(t, f.store.committed, allPlayerWrites)
			if f.cache.incrs != 1 {
				t.Fatalf("cache version bumped %d times, want 1", f.cache.incrs)
			}
		})
	}
}

// A malformed payload fails inside the transaction and is reported as
// ErrUUIDCouldNotBeParsed, so it dead-letters; nothing is committed.
func TestProcessMatchCompleted_BadUUID_NothingCommitted(t *testing.T) {
	tests := []struct {
		name  string
		event func() *pb.MatchEndedEvent
	}{
		{"session id", func() *pb.MatchEndedEvent { e := twoPlayerMatch(); e.SessionId = "nope"; return e }},
		{"second member id", func() *pb.MatchEndedEvent { e := twoPlayerMatch(); e.Players[1].MemberId = "nope"; return e }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newMatchFixture()

			err := f.svc.ProcessMatchCompleted(context.Background(), uuid.New(), commonconstants.GameMatchEnded, tt.event())

			if !errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
				t.Fatalf("err = %v, want ErrUUIDCouldNotBeParsed", err)
			}
			if o := classify(err); o.disposition != reject {
				t.Fatalf("classified %v, want reject", o.disposition)
			}
			assertWrites(t, f.store.committed, nil)
			if len(f.store.seen) != 0 || f.cache.incrs != 0 {
				t.Fatalf("inbox %v, cache bumps %d, want neither", f.store.seen, f.cache.incrs)
			}
		})
	}
}

// The inbox mark is the first statement of the transaction; if it fails
// nothing else runs and the failure is returned.
func TestProcessMatchCompleted_InboxFails_NoWrites(t *testing.T) {
	f := newMatchFixture()
	f.inbox.err = fmt.Errorf("inbox repo: %w", commonconstants.ErrTransient)

	err := f.svc.ProcessMatchCompleted(context.Background(), uuid.New(), commonconstants.GameMatchEnded, twoPlayerMatch())

	if !errors.Is(err, commonconstants.ErrTransient) {
		t.Fatalf("err = %v, want ErrTransient", err)
	}
	if len(f.store.staged) != 0 || len(f.store.committed) != 0 || f.cache.incrs != 0 {
		t.Fatalf("staged %v committed %v bumps %d, want nothing", f.store.staged, f.store.committed, f.cache.incrs)
	}
}

// An event with no players still records its inbox row, so a redelivery is a
// no-op.
func TestProcessMatchCompleted_NoPlayers_InboxOnly(t *testing.T) {
	f := newMatchFixture()
	eventID := uuid.New()
	event := &pb.MatchEndedEvent{SessionId: "550e8400-e29b-41d4-a716-446655440000"}

	if err := f.svc.ProcessMatchCompleted(context.Background(), eventID, commonconstants.GameMatchEnded, event); err != nil {
		t.Fatalf("process: %v", err)
	}
	if !f.store.seen[inboxKey{eventID, commonconstants.GameMatchEnded}] || len(f.store.committed) != 0 {
		t.Fatalf("inbox %v committed %v, want only the inbox row", f.store.seen, f.store.committed)
	}
}

// When the transaction itself fails (begin or commit) no write was at fault:
// the store is, so the failure is tagged transient and retried without end.
// Nothing is committed and the cache is not bumped.
func TestProcessMatchCompleted_CommitFails_Transient(t *testing.T) {
	f := newMatchFixture()
	f.store.commitErr = errors.New("driver: bad connection")

	err := f.svc.ProcessMatchCompleted(context.Background(), uuid.New(), commonconstants.GameMatchEnded, twoPlayerMatch())

	if !errors.Is(err, commonconstants.ErrTransient) {
		t.Fatalf("err = %v, want ErrTransient", err)
	}
	if got := classify(err); got.disposition != retry {
		t.Fatalf("classified %v, want retry", got.disposition)
	}
	if len(f.store.committed) != 0 || f.cache.incrs != 0 {
		t.Fatalf("committed %v bumps %d, want nothing", f.store.committed, f.cache.incrs)
	}
}

// A write that fails inside the transaction is the event's failure, not the
// transaction's, and is not tagged transient.
func TestProcessMatchCompleted_WriteFails_NotTaggedTransient(t *testing.T) {
	f := newMatchFixture()
	f.repo.failHistoryFor = playerA
	f.repo.failErr = fmt.Errorf("store: %w", commonconstants.ErrConstraintViolation)

	err := f.svc.ProcessMatchCompleted(context.Background(), uuid.New(), commonconstants.GameMatchEnded, twoPlayerMatch())

	if !errors.Is(err, commonconstants.ErrConstraintViolation) || errors.Is(err, commonconstants.ErrTransient) {
		t.Fatalf("err = %v, want ErrConstraintViolation and not ErrTransient", err)
	}
}

// The cache bump after commit runs under its own short deadline, so a hung
// cache cannot stall the consumer; a failed bump is only logged.
func TestProcessMatchCompleted_CacheBump_Bounded(t *testing.T) {
	for _, cacheErr := range []error{nil, errors.New("redis: i/o timeout")} {
		t.Run(fmt.Sprint(cacheErr), func(t *testing.T) {
			f := newMatchFixture()
			f.cache.err = cacheErr
			start := time.Now()

			err := f.svc.ProcessMatchCompleted(context.Background(), uuid.New(), commonconstants.GameMatchEnded, twoPlayerMatch())

			if err != nil {
				t.Fatalf("process: %v, want nil whatever the cache does", err)
			}
			if f.cache.incrs != 1 || !f.cache.hadDeadline {
				t.Fatalf("bumps %d with deadline %v, want one bump under a deadline", f.cache.incrs, f.cache.hadDeadline)
			}
			if end := time.Now(); !f.cache.deadline.After(start) || f.cache.deadline.After(end.Add(cacheBumpTimeout)) {
				t.Fatalf("bump deadline %v, want within %v of the call", f.cache.deadline.Sub(start), cacheBumpTimeout)
			}
		})
	}
}

// A field visit is not a match: its event is recorded processed in the inbox
// and writes no stats, history or leaderboard row, and leaves the cached
// leaderboard alone. A run, named or left empty, is applied as before.
// FS-X2F2H §F R44, ADR-0031, I-X2F2H-2.
func TestProcessMatchCompleted_WorldType(t *testing.T) {
	tests := []struct {
		name       string
		worldType  string
		wantWrites []string
		wantBumps  int
	}{
		{"field visit: inbox only", commonconstants.WorldTypeField, nil, 0},
		{"run: every player's writes", commonconstants.WorldTypeRun, allPlayerWrites, 1},
		{"empty reads as run", "", allPlayerWrites, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newMatchFixture()
			eventID := uuid.New()
			event := twoPlayerMatch()
			event.WorldType = tt.worldType

			err := f.svc.ProcessMatchCompleted(context.Background(), eventID, commonconstants.GameMatchEnded, event)

			if err != nil {
				t.Fatalf("process: %v", err)
			}
			assertWrites(t, f.store.committed, tt.wantWrites)
			if !f.store.seen[inboxKey{eventID, commonconstants.GameMatchEnded}] {
				t.Fatalf("inbox %v has no %s row for %s", f.store.seen, commonconstants.GameMatchEnded, eventID)
			}
			if f.cache.incrs != tt.wantBumps {
				t.Fatalf("cache version bumped %d times, want %d", f.cache.incrs, tt.wantBumps)
			}
		})
	}
}

// A redelivered field visit is still a no-op the consumer acks.
func TestProcessMatchCompleted_FieldRedelivery_AlreadyProcessed(t *testing.T) {
	f := newMatchFixture()
	eventID := uuid.New()
	ctx := context.Background()
	event := twoPlayerMatch()
	event.WorldType = commonconstants.WorldTypeField

	if err := f.svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, event); err != nil {
		t.Fatalf("first delivery: %v", err)
	}
	err := f.svc.ProcessMatchCompleted(ctx, eventID, commonconstants.GameMatchEnded, event)

	if !errors.Is(err, commonconstants.ErrAlreadyProcessed) {
		t.Fatalf("redelivery error %v, want ErrAlreadyProcessed", err)
	}
	assertWrites(t, f.store.committed, nil)
	if f.cache.incrs != 0 {
		t.Fatalf("cache version bumped %d times, want 0", f.cache.incrs)
	}
}
