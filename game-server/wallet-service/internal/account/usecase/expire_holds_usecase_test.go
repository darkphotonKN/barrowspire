package usecase_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeExpiredHolds stands in for the candidate read. It answers whatever list it
// is given, which is how a stale list (the database clock ahead of ours) is staged.
// The list is taken to be in keyset order already; the fake pages through it the
// way the query does: the page after a position starts past that row, and holds
// at most limit rows. err fails every read; with failOnRead set it fails only that
// read (1-based), so the pages before it go through.
type fakeExpiredHolds struct {
	bidIDs     []uuid.UUID
	err        error
	failOnRead int

	reads []candidateRead
}

// candidateRead is one call to the candidate read: where its page started and
// how big it was allowed to be.
type candidateRead struct {
	after *dto.ExpiredHold
	limit int
}

// expiryOf gives each candidate a distinct expiry in list order, so a keyset
// position names one row.
func (f *fakeExpiredHolds) expiryOf(i int) time.Time {
	return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(i) * time.Second)
}

func (f *fakeExpiredHolds) Execute(ctx context.Context, after *dto.ExpiredHold, limit int) ([]dto.ExpiredHold, error) {
	f.reads = append(f.reads, candidateRead{after: after, limit: limit})
	if f.err != nil && (f.failOnRead == 0 || len(f.reads) == f.failOnRead) {
		return nil, f.err
	}

	start := 0
	if after != nil {
		for i, bidID := range f.bidIDs {
			if bidID == after.BidID && f.expiryOf(i).Equal(after.ExpiredAt) {
				start = i + 1
			}
		}
	}
	end := min(start+limit, len(f.bidIDs))

	page := make([]dto.ExpiredHold, 0, end-start)
	for i := start; i < end; i++ {
		page = append(page, dto.ExpiredHold{BidID: f.bidIDs[i], ExpiredAt: f.expiryOf(i)})
	}
	return page, nil
}

// accountWithHold is an account with 1000 gold and one 300 hold for bidID in the
// given status, lapsing at expiredAt.
func accountWithHold(t *testing.T, bidID uuid.UUID, status account.WalletHoldStatus, expiredAt time.Time) *account.Account {
	t.Helper()

	accountID := uuid.New()
	created := expiredAt.Add(-time.Hour)
	acc, err := account.Reconstitute(account.ReconstituteParams{
		ID:       accountID,
		MemberID: uuid.New(),
		Gold:     1000,
		Holds: []*account.HoldReconstituteParams{{
			ID:        uuid.New(),
			AccountID: accountID,
			BidID:     bidID,
			Status:    status,
			Amount:    300,
			ExpiredAt: expiredAt,
			CreatedAt: created,
			UpdatedAt: created,
		}},
		CreatedAt: created,
		UpdatedAt: created,
	})
	require.NoError(t, err)

	return acc
}

func TestExpireHoldsUC_ExpiredCandidate_IsReleasedAndCounted(t *testing.T) {
	now := time.Now()
	bidID := uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		bidID: accountWithHold(t, bidID, account.StatusReserved, now.Add(-time.Minute)),
	}}
	candidates := &fakeExpiredHolds{bidIDs: []uuid.UUID{bidID}}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

	require.NoError(t, err)
	assert.Equal(t, 1, released)
	assert.Equal(t, 1, repo.saves, "the release must be persisted")
	snap := repo.byBid[bidID].Snapshot()
	assert.Equal(t, account.StatusReleased, snap.WalletHolds[0].Status)
	assert.Equal(t, 1000, snap.Gold, "a release moves no gold")
}

// The candidate list is the database clock's opinion; the aggregate decides again
// with ours. When ours says the hold still backs a bid, it is left alone and the
// pass moves on: not released, not a failure, picked up a pass later.
func TestExpireHoldsUC_HoldNotYetExpired_IsSkippedAndThePassContinues(t *testing.T) {
	now := time.Now()
	live, lapsed := uuid.New(), uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
		live:   accountWithHold(t, live, account.StatusReserved, now.Add(time.Minute)),
		lapsed: accountWithHold(t, lapsed, account.StatusReserved, now.Add(-time.Minute)),
	}}
	candidates := &fakeExpiredHolds{bidIDs: []uuid.UUID{live, lapsed}}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

	require.NoError(t, err)
	assert.Equal(t, 1, released)
	assert.Equal(t, account.StatusReserved, repo.byBid[live].Snapshot().WalletHolds[0].Status)
	assert.Equal(t, account.StatusReleased, repo.byBid[lapsed].Snapshot().WalletHolds[0].Status)
}

// reloadingRepo rebuilds each account from scratch on every load, as the real
// repository does, so a retry after a failed save starts from the stored state
// rather than the attempt that failed. Saves for the bids in failFor always fail.
type reloadingRepo struct {
	stored  map[uuid.UUID]func() *account.Account
	failFor map[uuid.UUID]error
	// failOnce fails a bid's first save only: the race the sweep lost
	failOnce map[uuid.UUID]error

	saved map[uuid.UUID]*account.Account
	loads int
}

func (f *reloadingRepo) FindByBidID(ctx context.Context, bidID uuid.UUID) (*account.Account, error) {
	f.loads++
	return f.stored[bidID](), nil
}

func (f *reloadingRepo) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	bidID := before.WalletHolds[0].BidID
	if err, ok := f.failFor[bidID]; ok {
		return err
	}
	if err, ok := f.failOnce[bidID]; ok {
		delete(f.failOnce, bidID)
		return err
	}
	if f.saved == nil {
		f.saved = map[uuid.UUID]*account.Account{}
	}
	f.saved[bidID] = acc
	return nil
}

// logLine is one decoded JSON log record.
type logLine map[string]any

// captureLogs points the default logger at a buffer for the test's duration and
// returns a reader over what was logged. Not parallel-safe: slog.Default is global.
func captureLogs(t *testing.T) func() []logLine {
	t.Helper()

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	return func() []logLine {
		var lines []logLine
		dec := json.NewDecoder(bytes.NewReader(buf.Bytes()))
		for dec.More() {
			var l logLine
			require.NoError(t, dec.Decode(&l))
			lines = append(lines, l)
		}
		return lines
	}
}

func linesAt(lines []logLine, level string) []logLine {
	var out []logLine
	for _, l := range lines {
		if l["level"] == level {
			out = append(out, l)
		}
	}
	return out
}

// One bad account costs only its own hold this pass. Its save fails for good — an
// OCC conflict that outlasts every retry, then a plain database error — and the
// other candidates are still released; the failures are warned about, and the
// next pass tries them again.
func TestExpireHoldsUC_HoldThatCannotBeSaved_IsWarnedAndSkipped(t *testing.T) {
	logs := captureLogs(t)
	now := time.Now()
	contended, broken, fine := uuid.New(), uuid.New(), uuid.New()
	lapsed := func(bidID uuid.UUID) func() *account.Account {
		return func() *account.Account {
			return accountWithHold(t, bidID, account.StatusReserved, now.Add(-time.Minute))
		}
	}
	repo := &reloadingRepo{
		stored: map[uuid.UUID]func() *account.Account{
			contended: lapsed(contended), broken: lapsed(broken), fine: lapsed(fine),
		},
		failFor: map[uuid.UUID]error{
			contended: account.ErrConcurrentModification,
			broken:    errors.New("connection reset"),
		},
	}
	candidates := &fakeExpiredHolds{bidIDs: []uuid.UUID{contended, broken, fine}}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

	require.NoError(t, err, "a per-hold failure never fails the pass")
	assert.Equal(t, 1, released)
	require.Contains(t, repo.saved, fine)
	assert.Equal(t, account.StatusReleased, repo.saved[fine].Snapshot().WalletHolds[0].Status)

	warns := linesAt(logs(), "WARN")
	require.Len(t, warns, 2, "one warn per hold that failed")
	assert.Equal(t, contended.String(), warns[0]["bid_id"])
	assert.Contains(t, warns[0]["error"], usecase.ErrMaxRetries.Error())
	assert.Equal(t, broken.String(), warns[1]["bid_id"])
}

// A hold whose account cannot be loaded at all — corrupt, or the database gone
// between the read and the load — is skipped the same way.
func TestExpireHoldsUC_HoldThatCannotBeLoaded_IsWarnedAndSkipped(t *testing.T) {
	logs := captureLogs(t)
	now := time.Now()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{}, findErr: errors.New("corrupt account")}
	candidates := &fakeExpiredHolds{bidIDs: []uuid.UUID{uuid.New(), uuid.New()}}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

	require.NoError(t, err)
	assert.Equal(t, 0, released)
	assert.Len(t, repo.lookups, 2, "the first failure does not end the pass")
	assert.Len(t, linesAt(logs(), "WARN"), 2)
}

// One info line per pass carries the released count, so an operator can see the
// sweep working even when it has nothing to do.
func TestExpireHoldsUC_EachPass_LogsOneInfoLineWithTheReleasedCount(t *testing.T) {
	now := time.Now()
	bidID := uuid.New()

	tests := []struct {
		name   string
		bidIDs []uuid.UUID
		want   float64
	}{
		{"nothing expired", nil, 0},
		{"one expired", []uuid.UUID{bidID}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
				bidID: accountWithHold(t, bidID, account.StatusReserved, now.Add(-time.Minute)),
			}}

			_, err := usecase.NewExpireHoldsUC(&fakeExpiredHolds{bidIDs: tt.bidIDs}, repo).
				Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

			require.NoError(t, err)
			infos := linesAt(logs(), "INFO")
			require.Len(t, infos, 1)
			assert.Equal(t, tt.want, infos[0]["released"])
		})
	}
}

// lapsedAccounts gives each bid its own account holding one RESERVED hold that
// lapsed a minute before now.
func lapsedAccounts(t *testing.T, now time.Time, bidIDs []uuid.UUID) map[uuid.UUID]*account.Account {
	t.Helper()

	byBid := make(map[uuid.UUID]*account.Account, len(bidIDs))
	for _, bidID := range bidIDs {
		byBid[bidID] = accountWithHold(t, bidID, account.StatusReserved, now.Add(-time.Minute))
	}
	return byBid
}

func newBidIDs(n int) []uuid.UUID {
	bidIDs := make([]uuid.UUID, n)
	for i := range bidIDs {
		bidIDs[i] = uuid.New()
	}
	return bidIDs
}

// A backlog is read 100 at a time but worked off in one pass: page after page,
// each starting after the last row of the one before, until a page comes back
// short.
func TestExpireHoldsUC_Backlog_IsReadInPagesOfOneHundredUntilAShortPage(t *testing.T) {
	tests := []struct {
		name      string
		expired   int
		wantReads int
	}{
		{"nothing expired", 0, 1},
		{"one short page", 99, 1},
		{"exactly one full page, then an empty one", 100, 2},
		{"two full pages and a short one", 250, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			bidIDs := newBidIDs(tt.expired)
			repo := &multiAccountRepo{byBid: lapsedAccounts(t, now, bidIDs)}
			candidates := &fakeExpiredHolds{bidIDs: bidIDs}

			released, err := usecase.NewExpireHoldsUC(candidates, repo).
				Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

			require.NoError(t, err)
			assert.Equal(t, tt.expired, released, "the whole backlog goes in one pass")
			require.Len(t, candidates.reads, tt.wantReads)
			assert.Nil(t, candidates.reads[0].after, "the first page starts at the beginning")
			for i, read := range candidates.reads {
				assert.Equal(t, 100, read.limit, "read %d", i)
				if i == 0 {
					continue
				}
				last := 100*i - 1
				require.NotNil(t, read.after, "read %d", i)
				assert.Equal(t, bidIDs[last], read.after.BidID, "read %d starts after the last row of the page before", i)
				assert.Equal(t, candidates.expiryOf(last), read.after.ExpiredAt, "read %d keys on expiry too", i)
			}
		})
	}
}

// No head-of-line blocking: one account whose holds fail every time and fill the
// first page — more than a page of them — cannot starve the release behind it.
// Each is warned about and skipped, the keyset moves past them, and the hold
// behind them is released in the same pass.
func TestExpireHoldsUC_HoldsBehindFullPagesOfFailures_AreReleasedInTheSamePass(t *testing.T) {
	logs := captureLogs(t)
	now := time.Now()
	broken := newBidIDs(150)
	fine := uuid.New()

	lapsed := func(bidID uuid.UUID) func() *account.Account {
		return func() *account.Account {
			return accountWithHold(t, bidID, account.StatusReserved, now.Add(-time.Minute))
		}
	}
	repo := &reloadingRepo{
		stored:  map[uuid.UUID]func() *account.Account{fine: lapsed(fine)},
		failFor: map[uuid.UUID]error{},
	}
	for _, bidID := range broken {
		repo.stored[bidID] = lapsed(bidID)
		repo.failFor[bidID] = errors.New("corrupt account")
	}
	candidates := &fakeExpiredHolds{bidIDs: append(append([]uuid.UUID{}, broken...), fine)}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).
		Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

	require.NoError(t, err)
	assert.Equal(t, 1, released)
	require.Contains(t, repo.saved, fine, "the hold behind the failures is released")
	assert.Equal(t, account.StatusReleased, repo.saved[fine].Snapshot().WalletHolds[0].Status)
	assert.Len(t, linesAt(logs(), "WARN"), len(broken), "one warn per hold that failed")
}

// shutdownRepo cancels the pass's context when it reaches cancelAt, as a SIGTERM
// arriving mid-pass does. With failLoad or failSave the cut-short call then fails
// the way the driver reports an aborted query; without either it succeeds, so the
// cancel lands between holds. With cancelAfterSave the cancel waits until
// cancelAt's save has gone through instead.
type shutdownRepo struct {
	*multiAccountRepo
	cancel          context.CancelFunc
	cancelAt        uuid.UUID
	cancelAfterSave bool
	failLoad        bool
	failSave        bool
}

func (f *shutdownRepo) FindByBidID(ctx context.Context, bidID uuid.UUID) (*account.Account, error) {
	acc, err := f.multiAccountRepo.FindByBidID(ctx, bidID)
	if bidID != f.cancelAt || f.cancelAfterSave {
		return acc, err
	}
	f.cancel()
	if f.failLoad {
		return nil, fmt.Errorf("wallet_holds FindByBidID: %w", ctx.Err())
	}
	return acc, err
}

func (f *shutdownRepo) Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error {
	if f.failSave && ctx.Err() != nil {
		return fmt.Errorf("accounts Save: %w", ctx.Err())
	}
	err := f.multiAccountRepo.Save(ctx, acc, before)
	if f.cancelAfterSave && before.WalletHolds[0].BidID == f.cancelAt {
		f.cancel()
	}
	return err
}

// A load or save cut short by shutdown is not a hold the sweep skipped: it is the
// pass stopping. It is not warned about, and the holds after it are not tried.
func TestExpireHoldsUC_LoadOrSaveCutShortByShutdown_IsNotWarned(t *testing.T) {
	for _, tt := range []struct {
		name               string
		failLoad, failSave bool
	}{
		{"load", true, false},
		{"save", false, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			now := time.Now()
			bidIDs := newBidIDs(2)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			repo := &shutdownRepo{
				multiAccountRepo: &multiAccountRepo{byBid: lapsedAccounts(t, now, bidIDs)},
				cancel:           cancel,
				cancelAt:         bidIDs[0],
				failLoad:         tt.failLoad,
				failSave:         tt.failSave,
			}

			_, err := usecase.NewExpireHoldsUC(&fakeExpiredHolds{bidIDs: bidIDs}, repo).
				Handle(ctx, &usecase.ExpireHoldsCommand{Now: now})

			require.ErrorIs(t, err, context.Canceled)
			assert.Empty(t, linesAt(logs(), "WARN"), "shutdown is not a skipped hold")
			assert.Equal(t, []uuid.UUID{bidIDs[0]}, repo.lookups, "the pass stops; the next hold is not tried")
		})
	}
}

// Shutdown landing just after a hold is saved, with more holds left on the page,
// stops the pass there (§Req 8): the hold in hand is released and counted, and the
// next hold on the page is never loaded.
func TestExpireHoldsUC_ContextCancelledAfterAHoldIsSaved_LoadsNoFurtherHold(t *testing.T) {
	logs := captureLogs(t)
	now := time.Now()
	bidIDs := newBidIDs(3)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	repo := &shutdownRepo{
		multiAccountRepo: &multiAccountRepo{byBid: lapsedAccounts(t, now, bidIDs)},
		cancel:           cancel,
		cancelAt:         bidIDs[0],
		cancelAfterSave:  true,
	}
	candidates := &fakeExpiredHolds{bidIDs: bidIDs}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).
		Handle(ctx, &usecase.ExpireHoldsCommand{Now: now})

	require.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 1, released, "the hold in hand is finished")
	assert.Equal(t, 1, repo.saves)
	assert.Equal(t, account.StatusReleased, repo.byBid[bidIDs[0]].Snapshot().WalletHolds[0].Status)
	assert.Equal(t, []uuid.UUID{bidIDs[0]}, repo.lookups, "hold 1 is never loaded")
	assert.Len(t, candidates.reads, 1)
	assert.Empty(t, linesAt(logs(), "WARN"), "shutdown is not a skipped hold")
}

// Shutdown landing as the last hold of a full page is done stops the pass before
// it reads another page.
func TestExpireHoldsUC_ContextCancelledBetweenPages_ReadsNoFurtherPage(t *testing.T) {
	now := time.Now()
	bidIDs := newBidIDs(150)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	repo := &shutdownRepo{
		multiAccountRepo: &multiAccountRepo{byBid: lapsedAccounts(t, now, bidIDs)},
		cancel:           cancel,
		cancelAt:         bidIDs[99],
	}
	candidates := &fakeExpiredHolds{bidIDs: bidIDs}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).
		Handle(ctx, &usecase.ExpireHoldsCommand{Now: now})

	require.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 100, released, "the hold in hand is finished")
	assert.Len(t, candidates.reads, 1, "no page is read after shutdown")
}

// A hold settled between the read and the load — committed by settlement, released
// by its caller or by another replica's sweep — is past the Cancel's reach. Nothing
// is saved, nothing counted, nothing warned.
func TestExpireHoldsUC_HoldAlreadySettled_IsANoOp(t *testing.T) {
	for _, status := range []account.WalletHoldStatus{account.StatusCommitted, account.StatusReleased} {
		t.Run(string(status), func(t *testing.T) {
			logs := captureLogs(t)
			now := time.Now()
			bidID := uuid.New()
			repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{
				bidID: accountWithHold(t, bidID, status, now.Add(-time.Minute)),
			}}

			released, err := usecase.NewExpireHoldsUC(&fakeExpiredHolds{bidIDs: []uuid.UUID{bidID}}, repo).
				Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

			require.NoError(t, err)
			assert.Equal(t, 0, released)
			assert.Equal(t, 0, repo.saves)
			assert.Equal(t, status, repo.byBid[bidID].Snapshot().WalletHolds[0].Status)
			assert.Empty(t, linesAt(logs(), "WARN"))
		})
	}
}

// The sweep and a commit (or a release, or another replica) race on one account.
// The other side saves first, so the sweep's save loses on the version; it
// reloads, finds the winner's state, and leaves it as it is, without error.
func TestExpireHoldsUC_LosesTheRace_LeavesTheWinnersState(t *testing.T) {
	for _, winner := range []account.WalletHoldStatus{account.StatusCommitted, account.StatusReleased} {
		t.Run(string(winner), func(t *testing.T) {
			logs := captureLogs(t)
			now := time.Now()
			bidID := uuid.New()
			loads := 0
			repo := &reloadingRepo{
				stored: map[uuid.UUID]func() *account.Account{bidID: func() *account.Account {
					loads++
					if loads == 1 {
						return accountWithHold(t, bidID, account.StatusReserved, now.Add(-time.Minute))
					}
					return accountWithHold(t, bidID, winner, now.Add(-time.Minute))
				}},
				failOnce: map[uuid.UUID]error{bidID: account.ErrConcurrentModification},
			}

			released, err := usecase.NewExpireHoldsUC(&fakeExpiredHolds{bidIDs: []uuid.UUID{bidID}}, repo).
				Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

			require.NoError(t, err)
			assert.Equal(t, 0, released, "the sweep did not release it; the winner settled it")
			assert.Equal(t, 2, loads, "the loser reloads once")
			assert.NotContains(t, repo.saved, bidID, "the winner's state is not overwritten")
			assert.Empty(t, linesAt(logs(), "WARN"))
		})
	}
}

// Without candidates the pass cannot do anything; the error goes back to the
// worker, which logs it and ticks again.
func TestExpireHoldsUC_CandidateReadFails_FailsThePass(t *testing.T) {
	readErr := errors.New("database unavailable")
	repo := &multiAccountRepo{}

	_, err := usecase.NewExpireHoldsUC(&fakeExpiredHolds{err: readErr}, repo).
		Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: time.Now()})

	require.ErrorIs(t, err, readErr)
	assert.Empty(t, repo.lookups)
}

// The read can fail on any page (§Req 9), not only the first. The pass fails
// there, but what earlier pages released stays released and is counted; the
// candidates the failed page would have brought are left for the next pass.
func TestExpireHoldsUC_CandidateReadFailsOnALaterPage_KeepsEarlierReleasesAndFails(t *testing.T) {
	readErr := errors.New("database unavailable")
	now := time.Now()
	bidIDs := newBidIDs(150)
	repo := &multiAccountRepo{byBid: lapsedAccounts(t, now, bidIDs)}
	candidates := &fakeExpiredHolds{bidIDs: bidIDs, err: readErr, failOnRead: 2}

	released, err := usecase.NewExpireHoldsUC(candidates, repo).
		Handle(context.Background(), &usecase.ExpireHoldsCommand{Now: now})

	require.ErrorIs(t, err, readErr)
	assert.Equal(t, 100, released, "the first page's releases are counted")
	assert.Equal(t, 100, repo.saves)
	require.Len(t, candidates.reads, 2)
	for _, bidID := range bidIDs[:100] {
		assert.Equal(t, account.StatusReleased, repo.byBid[bidID].Snapshot().WalletHolds[0].Status)
	}
	for _, bidID := range bidIDs[100:] {
		assert.Equal(t, account.StatusReserved, repo.byBid[bidID].Snapshot().WalletHolds[0].Status)
	}
	assert.Len(t, repo.lookups, 100, "nothing past the failed page is tried")
}

// A context already cancelled when the pass starts (shutdown landing between
// ticks) stops it before the first page: nothing is read, loaded or warned about.
func TestExpireHoldsUC_ContextCancelledBeforeThePass_ReadsNothing(t *testing.T) {
	logs := captureLogs(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{}}
	candidates := &fakeExpiredHolds{bidIDs: []uuid.UUID{uuid.New(), uuid.New()}}

	_, err := usecase.NewExpireHoldsUC(candidates, repo).
		Handle(ctx, &usecase.ExpireHoldsCommand{Now: time.Now()})

	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, candidates.reads)
	assert.Empty(t, repo.lookups)
	assert.Empty(t, linesAt(logs(), "WARN"))
}
