package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/withdrawlisting"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"
)

// fakeWithdrawalStarter stands in for the withdraw-listing workflow's starter. It
// records every start, and on what context, and can be scripted to fail.
type fakeWithdrawalStarter struct {
	err        error
	calls      int
	gotListing uuid.UUID
	gotItem    uuid.UUID
	gotBids    []uuid.UUID
	gotCtxErr  error
	gotDL      bool
}

func (f *fakeWithdrawalStarter) StartListingWithdrawal(ctx context.Context, listingID, itemID uuid.UUID, bidIDs []uuid.UUID) error {
	f.calls++
	f.gotListing = listingID
	f.gotItem = itemID
	f.gotBids = bidIDs
	f.gotCtxErr = ctx.Err()
	_, f.gotDL = ctx.Deadline()
	return f.err
}

// contestedListing is an ACTIVE listing an hour from its end, carrying a leader,
// an outbid bid and a bid its bidder withdrew. It returns every bid id.
func contestedListing(t *testing.T) (*listing.Listing, []uuid.UUID) {
	t.Helper()
	now := time.Now()
	l := activeListing(t, 100)

	outbid, leader, withdrawn := uuid.New(), uuid.New(), uuid.New()
	withdrawer := uuid.New()
	require.NoError(t, l.PlaceBidWithID(outbid, uuid.New(), 150, uuid.Nil, now))
	require.NoError(t, l.ConfirmBid(outbid, now))
	require.NoError(t, l.PlaceBidWithID(leader, uuid.New(), 200, uuid.Nil, now))
	require.NoError(t, l.ConfirmBid(leader, now))
	require.NoError(t, l.PlaceBidWithID(withdrawn, withdrawer, 250, uuid.Nil, now))
	require.NoError(t, l.WithdrawBid(withdrawn, withdrawer, now))

	return l, []uuid.UUID{outbid, leader, withdrawn}
}

// fakeWithdrawalMarker stands in for the repository's MarkWithdrawalStarted. It
// records every mark, on what context, and can be scripted to fail. log, when
// set, is shared with a starter so a test can see the order of the two.
type fakeWithdrawalMarker struct {
	err       error
	marked    []uuid.UUID
	gotCtxErr error
	gotDL     bool
	log       *[]string
}

func (f *fakeWithdrawalMarker) MarkWithdrawalStarted(ctx context.Context, listingID uuid.UUID) error {
	f.marked = append(f.marked, listingID)
	f.gotCtxErr = ctx.Err()
	_, f.gotDL = ctx.Deadline()
	if f.log != nil {
		*f.log = append(*f.log, "mark")
	}
	return f.err
}

func withdrawListing(repo *fakeRepo, starter ListingWithdrawalStarter, marker *fakeWithdrawalMarker, l *listing.Listing, memberID uuid.UUID, now time.Time) error {
	return NewWithdrawListingUC(repo, starter, marker).Handle(context.Background(), WithdrawListingCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  memberID,
		Now:       now,
	})
}

// FS-V7A5S Reqs 5, 7: the write goes through the row lock, then the workflow is
// started once with the item and every bid on the listing, statuses unfiltered.
func TestWithdrawListingUC_Success_StartsTheWorkflowWithTheItemAndEveryBid(t *testing.T) {
	l, bidIDs := contestedListing(t)
	repo := &fakeRepo{listing: l, saveErr: errors.New("Save must not be called: the write takes the row lock")}
	var order []string
	starter := &orderedWithdrawalStarter{log: &order}
	marker := &fakeWithdrawalMarker{log: &order}

	err := withdrawListing(repo, starter, marker, l, l.Snapshot().SellerID, time.Now())

	require.NoError(t, err)
	assert.Equal(t, 1, repo.updateCall, "one locked write")
	assert.Equal(t, listing.StatusCancelled, l.Snapshot().Status)

	require.Equal(t, 1, starter.calls)
	assert.Equal(t, l.Snapshot().ID, starter.gotListing)
	assert.Equal(t, l.Snapshot().ItemID, starter.gotItem)
	assert.ElementsMatch(t, bidIDs, starter.gotBids, "every bid, the withdrawn one too: wallet skips what it holds nothing for")

	// Req 8 (amended 2026-11-05): once the start lands the listing is marked, so
	// the backstop never selects it
	assert.Equal(t, []uuid.UUID{l.Snapshot().ID}, marker.marked)
	assert.Equal(t, []string{"start", "mark"}, order, "marked only after the start")
	assert.NoError(t, marker.gotCtxErr)
	assert.True(t, marker.gotDL, "the mark is bounded")
}

// orderedWithdrawalStarter is a fakeWithdrawalStarter that also logs its start
// into a log shared with a marker.
type orderedWithdrawalStarter struct {
	fakeWithdrawalStarter
	log *[]string
}

func (s *orderedWithdrawalStarter) StartListingWithdrawal(ctx context.Context, listingID, itemID uuid.UUID, bidIDs []uuid.UUID) error {
	*s.log = append(*s.log, "start")
	return s.fakeWithdrawalStarter.StartListingWithdrawal(ctx, listingID, itemID, bidIDs)
}

// alreadyStartedClient is a Temporal client whose every start is rejected as a
// duplicate, the answer for a listing whose workflow already ran.
type alreadyStartedClient struct {
	client.Client
}

func (alreadyStartedClient) ExecuteWorkflow(context.Context, client.StartWorkflowOptions, any, ...any) (client.WorkflowRun, error) {
	return nil, serviceerror.NewWorkflowExecutionAlreadyStarted("already started", "", "")
}

// Req 8: the starter answering already-started is a start that landed, so the
// listing is marked then too, through the real starter's reading of Temporal's
// duplicate rejection.
func TestWithdrawListingUC_AlreadyStarted_MarksTheListing(t *testing.T) {
	l, _ := contestedListing(t)
	repo := &fakeRepo{listing: l}
	marker := &fakeWithdrawalMarker{}

	err := withdrawListing(repo, withdrawlisting.NewStarter(alreadyStartedClient{}), marker, l, l.Snapshot().SellerID, time.Now())

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{l.Snapshot().ID}, marker.marked)
}

// Req 8: a failed mark only costs one more start, the backstop's, which is a
// REJECT_DUPLICATE no-op that marks it then. The workflow did start, so the
// withdrawal is a success; the mark runs detached from the request too.
func TestWithdrawListingUC_MarkFails_IsStillASuccess(t *testing.T) {
	l, _ := contestedListing(t)
	repo := &fakeRepo{listing: l}
	starter := &fakeWithdrawalStarter{}
	marker := &fakeWithdrawalMarker{err: errors.New("db down")}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := NewWithdrawListingUC(repo, starter, marker).Handle(ctx, WithdrawListingCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  l.Snapshot().SellerID,
		Now:       time.Now(),
	})

	require.NoError(t, err, "the workflow started; a failed mark is logged only")
	assert.Equal(t, 1, starter.calls)
	assert.Len(t, marker.marked, 1)
	assert.NoError(t, marker.gotCtxErr, "a cancelled request must not cancel the mark")
}

// Req 8: the start does not ride the request's cancellation, and is bounded.
func TestWithdrawListingUC_StartsOnADetachedBoundedContext(t *testing.T) {
	l, _ := contestedListing(t)
	starter := &fakeWithdrawalStarter{}
	ctx, cancel := context.WithCancel(context.Background())

	// the request's context is gone by the time the start runs
	repo := &fakeRepo{listing: l}
	uc := NewWithdrawListingUC(repo, starter, &fakeWithdrawalMarker{})
	cancel()
	err := uc.Handle(ctx, WithdrawListingCommand{ListingID: l.Snapshot().ID, MemberID: l.Snapshot().SellerID, Now: time.Now()})

	require.NoError(t, err)
	require.Equal(t, 1, starter.calls)
	assert.NoError(t, starter.gotCtxErr, "a cancelled request must not cancel the start")
	assert.True(t, starter.gotDL, "the start is bounded by its own short timeout")
}

// A refusal writes nothing that needs undoing and starts nothing; the domain's
// sentinel reaches the caller intact so the handler can map it.
func TestWithdrawListingUC_Refused_StartsNothing(t *testing.T) {
	tests := []struct {
		name      string
		member    func(l *listing.Listing) uuid.UUID
		now       func(l *listing.Listing) time.Time
		updateErr error
		wantErr   error
	}{
		{
			name:    "not the seller",
			member:  func(l *listing.Listing) uuid.UUID { return uuid.New() },
			now:     func(l *listing.Listing) time.Time { return time.Now() },
			wantErr: listing.ErrNotSeller,
		},
		{
			name:    "contested, inside the final 30 minutes",
			member:  func(l *listing.Listing) uuid.UUID { return l.Snapshot().SellerID },
			now:     func(l *listing.Listing) time.Time { return l.Snapshot().EndsAt.Add(-listing.ListingWithdrawLock) },
			wantErr: listing.ErrListingWithdrawLocked,
		},
		{
			name:    "past its end",
			member:  func(l *listing.Listing) uuid.UUID { return l.Snapshot().SellerID },
			now:     func(l *listing.Listing) time.Time { return l.Snapshot().EndsAt },
			wantErr: listing.ErrListingExpired,
		},
		{
			name:      "unknown listing",
			member:    func(l *listing.Listing) uuid.UUID { return l.Snapshot().SellerID },
			now:       func(l *listing.Listing) time.Time { return time.Now() },
			updateErr: commonconstants.ErrNotFound,
			wantErr:   commonconstants.ErrNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l, _ := contestedListing(t)
			repo := &fakeRepo{listing: l, updateErr: tt.updateErr}
			starter := &fakeWithdrawalStarter{}
			marker := &fakeWithdrawalMarker{}

			err := withdrawListing(repo, starter, marker, l, tt.member(l), tt.now(l))

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Zero(t, starter.calls)
			assert.Empty(t, marker.marked)
		})
	}
}

// Reqs 4, 8 and the Edge State "workflow start fails" (amended 2026-11-05): the
// listing is withdrawn but nothing returned the item or the gold, so the call
// reports a transient failure rather than success. The seller's retry is a repeat
// on a CANCELLED listing: it succeeds and starts the workflow again, with the same
// item and bid set read from the CANCELLED listing.
func TestWithdrawListingUC_StartFails_IsTransientAndTheRepeatStartsIt(t *testing.T) {
	l, bidIDs := contestedListing(t)
	repo := &fakeRepo{listing: l}
	seller := l.Snapshot().SellerID
	now := time.Now()

	failing := &fakeWithdrawalStarter{err: errors.New("temporal unreachable")}
	marker := &fakeWithdrawalMarker{}
	err := withdrawListing(repo, failing, marker, l, seller, now)

	require.ErrorIs(t, err, commonconstants.ErrTransient, "a failed start answers 503 so the seller retries")
	assert.Empty(t, marker.marked, "an unstarted withdrawal stays unmarked, so the backstop still selects it")
	assert.Equal(t, listing.StatusCancelled, l.Snapshot().Status, "the committed write is kept, never rolled back")
	assert.Equal(t, 1, repo.updateCall)
	withdrawn := l.Snapshot()

	retry := &fakeWithdrawalStarter{}
	err = withdrawListing(repo, retry, marker, l, seller, now.Add(time.Minute))

	require.NoError(t, err)
	assert.Equal(t, withdrawn, l.Snapshot(), "the repeat changes nothing")
	require.Equal(t, 1, retry.calls, "the retry restarts the workflow")
	assert.Equal(t, withdrawn.ItemID, retry.gotItem)
	assert.ElementsMatch(t, bidIDs, retry.gotBids)
	assert.Equal(t, []uuid.UUID{withdrawn.ID}, marker.marked, "the retry's start is marked")
}

// A repeat whose start fails again is transient again: success would hide that
// the item and the gold are still out.
func TestWithdrawListingUC_RepeatWhoseStartFails_IsTransient(t *testing.T) {
	l, _ := contestedListing(t)
	repo := &fakeRepo{listing: l}
	seller := l.Snapshot().SellerID
	failing := &fakeWithdrawalStarter{err: errors.New("temporal unreachable")}

	_ = withdrawListing(repo, failing, &fakeWithdrawalMarker{}, l, seller, time.Now())
	err := withdrawListing(repo, failing, &fakeWithdrawalMarker{}, l, seller, time.Now())

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Equal(t, 2, failing.calls)
}

// A write that never committed (here, the row lock timed out) withdrew nothing,
// so there is nothing to return and nothing is started.
func TestWithdrawListingUC_WriteFails_StartsNothing(t *testing.T) {
	l, _ := contestedListing(t)
	repo := &fakeRepo{listing: l, updateErr: commonconstants.ErrLockUnavailable}
	starter := &fakeWithdrawalStarter{}
	marker := &fakeWithdrawalMarker{}

	err := withdrawListing(repo, starter, marker, l, l.Snapshot().SellerID, time.Now())

	assert.ErrorIs(t, err, commonconstants.ErrLockUnavailable)
	assert.Zero(t, starter.calls)
	assert.Empty(t, marker.marked)
}
