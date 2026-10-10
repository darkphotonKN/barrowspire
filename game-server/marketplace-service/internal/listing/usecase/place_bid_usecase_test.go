package usecase

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var errListingGone = errors.New("listing gone")

// fakeRepo drives the use cases without a database. Update is the only method
// the bid use cases touch, and it stands in for the real one by running fn
// against a listing the test set up — the same contract, minus the transaction
// and the row lock.
type fakeRepo struct {
	listing    *listing.Listing
	findErr    error
	updateErr  error
	saveErr    error
	updateCall int

	// updateScript, when set, decides Update call by call and wins over updateErr.
	// Entry i is call i's outcome; calls past the end of the script behave normally.
	updateScript []updateOutcome
	// gotUpdateCtxErrs records each Update call's ctx.Err(), so a test can prove a
	// retry did not inherit a cancelled request.
	gotUpdateCtxErrs []error
}

// updateOutcome is one scripted Update call. With neither flag set, fn never runs:
// the transaction failed before the row was read.
type updateOutcome struct {
	err error
	// committed: fn ran against the real listing and its changes stuck, yet err still
	// came back — a COMMIT that landed but whose acknowledgement was lost.
	committed bool
	// scratch: fn ran, but against a throwaway listing, so nothing stuck — a
	// statement that failed after the closure and rolled the transaction back.
	scratch *listing.Listing
}

// FindByID is a read: PlaceBid uses it only to learn when the listing ends, to
// set the hold's expiry. Writes are still refused below — they go through Update.
func (f *fakeRepo) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	return f.listing, nil
}

func (f *fakeRepo) Insert(ctx context.Context, l *listing.Listing) error {
	return errors.New("Insert must not be called on a bid path")
}

// Save is the OCC path, which the withdraw use cases still take.
func (f *fakeRepo) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	return f.saveErr
}

func (f *fakeRepo) Update(ctx context.Context, id uuid.UUID, fn func(*listing.Listing) error) error {
	f.updateCall++
	f.gotUpdateCtxErrs = append(f.gotUpdateCtxErrs, ctx.Err())

	if i := f.updateCall - 1; i < len(f.updateScript) {
		o := f.updateScript[i]
		switch {
		case o.committed:
			if err := fn(f.listing); err != nil {
				return err
			}
		case o.scratch != nil:
			if err := fn(o.scratch); err != nil {
				return err
			}
		}
		return o.err
	}

	if f.updateErr != nil {
		return f.updateErr
	}
	return fn(f.listing)
}

// fakeWallet stands in for wallet-service. It records what it was asked to hold
// so tests can prove the bid's own amount and member reach the hold, and can be
// scripted to fail.
type fakeWallet struct {
	err   error
	calls int

	gotBidID     uuid.UUID
	gotMemberID  uuid.UUID
	gotGold      int
	gotExpiresAt time.Time

	releaseErr       error
	releaseCalls     int
	gotReleasedBidID uuid.UUID
	gotReleaseCtxErr error
	// releaseErrs scripts ReleaseHold call by call and wins over releaseErr; calls
	// past the end of the script return releaseErr.
	releaseErrs []error
}

func (f *fakeWallet) ReleaseHold(ctx context.Context, bidID uuid.UUID) error {
	f.releaseCalls++
	f.gotReleasedBidID = bidID
	f.gotReleaseCtxErr = ctx.Err()
	if i := f.releaseCalls - 1; i < len(f.releaseErrs) {
		return f.releaseErrs[i]
	}
	return f.releaseErr
}

func (f *fakeWallet) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error {
	f.calls++
	f.gotBidID = bidID
	f.gotMemberID = memberID
	f.gotGold = gold
	f.gotExpiresAt = expiresAt
	return f.err
}

// activeListing builds a published listing ready to receive bids.
func activeListing(t *testing.T, startPrice int) *listing.Listing {
	t.Helper()

	now := time.Now()
	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), startPrice, nil, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

// TestPlaceBidUC pins the use case's own contract: it delegates to Update and
// surfaces whatever the domain decides. The bidding rules themselves are covered
// by the domain tests and are not re-asserted here.
func TestPlaceBidUC(t *testing.T) {
	tests := []struct {
		name      string
		amount    int
		updateErr error
		wantErr   error
		wantBids  int
	}{
		{
			name:     "a valid bid is placed as pending",
			amount:   150,
			wantErr:  nil,
			wantBids: 1,
		},
		{
			// below the 100 reserve, so the domain refuses before a bid exists
			name:     "a bid below the reserve is rejected",
			amount:   50,
			wantErr:  listing.ErrBidTooLow,
			wantBids: 0,
		},
		{
			name:      "a repository failure surfaces to the caller",
			amount:    150,
			updateErr: commonconstants.ErrNotFound,
			wantErr:   commonconstants.ErrNotFound,
			wantBids:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := activeListing(t, 100)
			repo := &fakeRepo{listing: l, updateErr: tt.updateErr}

			err := NewPlaceBidUC(repo, &fakeWallet{}).Handle(context.Background(), PlaceBidCommand{
				ListingID: uuid.New(),
				MemberID:  uuid.New(),
				Amount:    tt.amount,
				Now:       time.Now(),
			})

			if tt.wantErr == nil {
				assert.NoError(t, err)
			} else {
				// errors.Is so the sentinel survives the use case's wrapping
				assert.ErrorIs(t, err, tt.wantErr)
			}

			assert.Equal(t, 1, repo.updateCall, "the write must go through Update")
			assert.Len(t, l.Snapshot().Bids, tt.wantBids)
		})
	}
}

// TestPlaceBidUCForwardsTheIdempotencyKey guards the wiring that makes retries
// safe. Dropping the key here compiles and passes every other test, but silently
// turns a replayed request into a member bidding against themselves.
func TestPlaceBidUCForwardsTheIdempotencyKey(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	uc := NewPlaceBidUC(repo, &fakeWallet{})
	key := uuid.New()
	member := uuid.New()

	cmd := PlaceBidCommand{
		ListingID:      uuid.New(),
		MemberID:       member,
		Amount:         150,
		IdempotencyKey: key,
		Now:            time.Now(),
	}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd), "a replay must be accepted")

	assert.Len(t, l.Snapshot().Bids, 1, "a replay must not create a second bid")
}

// TestConfirmBidUC covers the promotion step that runs after wallet holds the
// gold, including redelivery of the same confirmation.
func TestConfirmBidUC(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	require.NoError(t, NewPlaceBidUC(repo, &fakeWallet{}).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	}))

	bidID := l.Snapshot().Bids[0].ID
	uc := NewConfirmBidUC(repo)
	cmd := ConfirmBidCommand{ListingID: uuid.New(), BidID: bidID, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	assert.Equal(t, listing.BidStatusWinning, l.Snapshot().Bids[0].Status)

	assert.NoError(t, uc.Handle(context.Background(), cmd), "redelivery must not error")
}

// TestFailBidUC covers the compensating outcome: a bid whose hold could not be
// placed is marked FAILED.
//
// The bid is built through the domain rather than through PlaceBidUC, because on
// the synchronous path a placed bid is already WINNING — FailBid only ever runs
// against a PENDING bid, which is the shape the event-driven flow produces.
func TestFailBidUC(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	bidID := uuid.New()
	require.NoError(t, l.PlaceBidWithID(bidID, uuid.New(), 150, uuid.Nil, time.Now()))

	require.NoError(t, NewFailBidUC(repo).Handle(context.Background(), FailBidCommand{
		ListingID: uuid.New(),
		BidID:     bidID,
		Now:       time.Now(),
	}))

	assert.Equal(t, listing.BidStatusFailed, l.Snapshot().Bids[0].Status)
}

// TestPlaceBidHoldsGoldBeforeRecordingTheBid pins the ordering that makes this
// use case an orchestrator rather than a single write. The hold comes first: a
// bid recorded before the gold is secured is a claim with nothing behind it, and
// the listing would show a leader who may not be able to pay.
func TestPlaceBidHoldsGoldBeforeRecordingTheBid(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{}
	member := uuid.New()

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  member,
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, wallet.calls, "gold must be held")
	assert.Equal(t, member, wallet.gotMemberID)
	assert.Equal(t, 150, wallet.gotGold, "the hold must match the bid")

	bids := l.Snapshot().Bids
	require.Len(t, bids, 1)
	assert.Equal(t, bids[0].ID, wallet.gotBidID, "the hold must be keyed by this bid")
	assert.Equal(t, listing.BidStatusWinning, bids[0].Status, "a held bid takes the lead immediately")
}

// TestPlaceBidRecordsNothingWhenTheHoldFails covers the cheap failure: the buyer
// could not cover the bid, so nothing was reserved and nothing should be written.
func TestPlaceBidRecordsNothingWhenTheHoldFails(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{err: errors.New("insufficient available gold")}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	assert.Error(t, err)
	assert.Zero(t, repo.updateCall, "no hold means no bid")
	assert.Empty(t, l.Snapshot().Bids)
}

// Once PlaceHold succeeds the bidder's gold is frozen, so a write that then fails
// leaves it frozen behind a bid nobody recorded. Nothing in settlement will ever
// release it either: settlement works from the listing's bids, and this one is not
// there. So the use case that reserved the gold is the one that has to give it back.
//
// Only a failure that proves the transaction rolled back counts — here a lock
// timeout, which fails before the row is read. TestPlaceBidUC_WriteOutcome covers
// the rest.
func TestPlaceBidReleasesTheHoldWhenTheWriteFails(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, updateErr: commonconstants.ErrLockUnavailable}
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, commonconstants.ErrLockUnavailable, "the caller still learns why the bid failed")
	assert.Equal(t, 1, wallet.calls, "the gold was held")
	assert.Equal(t, 1, wallet.releaseCalls, "and given straight back")
	assert.Equal(t, wallet.gotBidID, wallet.gotReleasedBidID, "the hold released is the one placed")
	assert.Empty(t, l.Snapshot().Bids, "no bid was recorded")
}

// The compensation is best effort: it runs on a bidder's request path, so it gets a
// few bounded attempts and the reconciler sweeps up what it misses. What it must not
// do is replace the real failure — a caller told "release failed" learns nothing
// about why their bid did not land.
func TestPlaceBidCompensationFailure_StillReportsTheOriginalError(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, updateErr: commonconstants.ErrLockUnavailable}
	wallet := &fakeWallet{releaseErr: errors.New("wallet unreachable")}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, commonconstants.ErrLockUnavailable, "the write failure is what the bidder needs to hear")
}

// The hold must outlive settlement, not an arbitrary hour: it lapses at the
// listing's end plus settlement grace (FS-NXP1W §Req 19), so the sweeper cannot
// release it while settlement is still working towards the commit.
func TestPlaceBidUC_HoldExpiresAtListingEndPlusGrace(t *testing.T) {
	l := activeListing(t, 100)
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{listing: l}, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, l.Snapshot().EndsAt.Add(settlementGrace), wallet.gotExpiresAt)
}

// Reading the listing's end time now comes before the hold, so a listing that
// cannot be read — missing, or the read failed — stops the bid before any gold
// is frozen for it.
func TestPlaceBidUC_UnreadableListing_HoldsNoGold(t *testing.T) {
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{findErr: errors.New("listing not found")}, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	assert.Error(t, err)
	assert.Zero(t, wallet.calls)
}

// A listing past its end can never take this bid, so no gold may be held for
// it: the hold would be stranded the moment Update refused the bid. Asked of the
// aggregate before the hold — the same rule Update applies again under the lock.
func TestPlaceBidUC_ExpiredListing_HoldsNoGold(t *testing.T) {
	l := activeListing(t, 100) // ends an hour from now
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{listing: l}, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now().Add(2 * time.Hour),
	})

	assert.ErrorIs(t, err, listing.ErrListingExpired)
	assert.Zero(t, wallet.calls, "no gold may be held for a bid that cannot land")
}

// The bidder may be gone by the time the compensation runs — the tab closed, or the
// deadline passed. Compensating on that same context means the release is dead before
// it is sent, so the hold would be stranded in exactly the case the compensation
// exists for.
//
// The cleanup outlives the request that triggered it: it carries the request's
// values but not its cancellation, under a deadline of its own.
func TestPlaceBidCompensatesEvenWhenTheRequestIsCancelled(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, updateErr: commonconstants.ErrLockUnavailable}
	wallet := &fakeWallet{}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the bidder is already gone

	err := NewPlaceBidUC(repo, wallet).Handle(ctx, PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.Error(t, err)
	assert.Equal(t, 1, wallet.releaseCalls, "the gold still goes back")
	assert.NoError(t, wallet.gotReleaseCtxErr,
		"the release must not inherit the cancellation that killed the write")
}

// errCommitLost stands in for a failure the use case cannot classify: a dropped
// connection mid-COMMIT, say. Whether the bid landed is unknown.
var errCommitLost = errors.New("connection reset during commit")

// TestPlaceBidUC_WriteOutcome pins the TCC rule for the bid write. The hold is the
// Try; the write is the Confirm; ReleaseHold is the Cancel. Cancel runs only when
// the write provably did not land. A write whose outcome is unknown is retried —
// safe, because it is idempotent on the bid id, and the retry's row lock waits out
// any commit still in flight — and if it stays unknown the gold is left for the
// reconciler, which judges against the bids actually recorded.
func TestPlaceBidUC_WriteOutcome(t *testing.T) {
	tests := []struct {
		name string
		// seed places an existing confirmed bid on the listing before the test bid
		seed         int
		script       func(t *testing.T) []updateOutcome
		wantErrs     []error
		wantReleases int
		wantUpdates  int
		wantRecorded bool
	}{
		{
			name:         "a lock timeout fails before the read, so release",
			script:       func(t *testing.T) []updateOutcome { return []updateOutcome{{err: commonconstants.ErrLockUnavailable}} },
			wantErrs:     []error{commonconstants.ErrLockUnavailable},
			wantReleases: 1,
			wantUpdates:  1,
		},
		{
			name:         "a missing listing wrote nothing, so release",
			script:       func(t *testing.T) []updateOutcome { return []updateOutcome{{err: commonconstants.ErrNotFound}} },
			wantErrs:     []error{commonconstants.ErrNotFound},
			wantReleases: 1,
			wantUpdates:  1,
		},
		{
			name: "a statement rejected after the closure rolled back, so release",
			script: func(t *testing.T) []updateOutcome {
				return []updateOutcome{{err: commonconstants.ErrConstraintViolation, scratch: activeListing(t, 100)}}
			},
			wantErrs:     []error{commonconstants.ErrConstraintViolation},
			wantReleases: 1,
			wantUpdates:  1,
		},
		{
			name:         "the domain refusing the bid under the lock, so release",
			seed:         200,
			script:       func(t *testing.T) []updateOutcome { return nil },
			wantErrs:     []error{listing.ErrBidTooLow},
			wantReleases: 1,
			wantUpdates:  1,
		},
		{
			name: "a commit that landed but reported failure is found by the retry, nothing released",
			script: func(t *testing.T) []updateOutcome {
				return []updateOutcome{{err: errCommitLost, committed: true}}
			},
			wantReleases: 0,
			wantUpdates:  2,
			wantRecorded: true,
		},
		{
			name:         "a commit that did not land is written by the retry, nothing released",
			script:       func(t *testing.T) []updateOutcome { return []updateOutcome{{err: errCommitLost}} },
			wantReleases: 0,
			wantUpdates:  2,
			wantRecorded: true,
		},
		{
			name: "an outcome that stays unknown is left to the reconciler",
			script: func(t *testing.T) []updateOutcome {
				out := make([]updateOutcome, maxWriteAttempts)
				for i := range out {
					out[i] = updateOutcome{err: errCommitLost}
				}
				return out
			},
			wantErrs:     []error{commonconstants.ErrTransient, errCommitLost},
			wantReleases: 0,
			wantUpdates:  maxWriteAttempts,
		},
		{
			// the lock timeout proves only that the retry wrote nothing, not that the
			// first attempt's commit did not land
			name: "a retry that cannot take the lock settles nothing",
			script: func(t *testing.T) []updateOutcome {
				out := []updateOutcome{{err: errCommitLost}}
				for len(out) < maxWriteAttempts {
					out = append(out, updateOutcome{err: commonconstants.ErrLockUnavailable})
				}
				return out
			},
			wantErrs:     []error{commonconstants.ErrTransient},
			wantReleases: 0,
			wantUpdates:  maxWriteAttempts,
		},
		{
			// the retry read the locked row and our bid was not on it, so the first
			// attempt did not land; the domain's refusal is now definitive
			name:         "a retry refused by the domain proves the bid never landed, so release",
			seed:         200,
			script:       func(t *testing.T) []updateOutcome { return []updateOutcome{{err: errCommitLost}} },
			wantErrs:     []error{listing.ErrBidTooLow},
			wantReleases: 1,
			wantUpdates:  2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := activeListing(t, 100)
			if tt.seed > 0 {
				seedID := uuid.New()
				require.NoError(t, l.PlaceBidWithID(seedID, uuid.New(), tt.seed, uuid.Nil, time.Now()))
				require.NoError(t, l.ConfirmBid(seedID, time.Now()))
			}
			seeded := len(l.Snapshot().Bids)

			repo := &fakeRepo{listing: l, updateScript: tt.script(t)}
			wallet := &fakeWallet{}

			err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
				ListingID: uuid.New(),
				MemberID:  uuid.New(),
				Amount:    150,
				Now:       time.Now(),
			})

			if len(tt.wantErrs) == 0 {
				assert.NoError(t, err)
			}
			for _, want := range tt.wantErrs {
				assert.ErrorIs(t, err, want)
			}
			assert.Equal(t, tt.wantReleases, wallet.releaseCalls, "release calls")
			assert.Equal(t, tt.wantUpdates, repo.updateCall, "write attempts")

			bids := l.Snapshot().Bids
			if tt.wantRecorded {
				require.Len(t, bids, seeded+1, "exactly one bid, however many attempts it took")
				assert.Equal(t, wallet.gotBidID, bids[seeded].ID)
				assert.Equal(t, listing.BidStatusWinning, bids[seeded].Status)
			} else if len(tt.wantErrs) > 0 && !errors.Is(err, commonconstants.ErrTransient) {
				assert.Len(t, bids, seeded, "no bid was recorded")
			}
		})
	}
}

// A cancelled request is one of the likeliest reasons a COMMIT comes back ambiguous.
// Retrying on that same context would fail instantly and settle nothing, so the
// retry carries the request's values but not its cancellation.
func TestPlaceBidUC_RetriesTheWriteEvenWhenTheRequestIsCancelled(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, updateScript: []updateOutcome{{err: context.Canceled}}}
	wallet := &fakeWallet{}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := NewPlaceBidUC(repo, wallet).Handle(ctx, PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	require.Equal(t, 2, repo.updateCall)
	assert.NoError(t, repo.gotUpdateCtxErrs[1], "the retry must not inherit the cancellation")
	assert.Zero(t, wallet.releaseCalls)
	assert.Len(t, l.Snapshot().Bids, 1)
}

// A replayed request reaches PlaceHold with a fresh bid id, so wallet freezes the gold
// a second time; the domain then deduplicates on the idempotency key and records
// nothing. That second hold backs no bid, and nothing else will ever release it.
func TestPlaceBidUC_ReplayReleasesItsOwnHold(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{}
	uc := NewPlaceBidUC(repo, wallet)

	cmd := PlaceBidCommand{
		ListingID:      uuid.New(),
		MemberID:       uuid.New(),
		Amount:         150,
		IdempotencyKey: uuid.New(),
		Now:            time.Now(),
	}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	first := wallet.gotBidID
	assert.Zero(t, wallet.releaseCalls, "the first placement keeps its hold")

	require.NoError(t, uc.Handle(context.Background(), cmd), "a replay is still a success")
	assert.Equal(t, 1, wallet.releaseCalls, "the replay's hold goes back")
	assert.Equal(t, wallet.gotBidID, wallet.gotReleasedBidID, "the replay's own hold, not the recorded bid's")
	assert.NotEqual(t, first, wallet.gotReleasedBidID)
}

// ReleaseHold is idempotent, so a transient failure is worth another try — but only
// a transient one: anything else is wallet's answer, and asking again changes nothing.
func TestPlaceBidUC_ReleaseRetriesOnlyTransientFailures(t *testing.T) {
	transient := fmt.Errorf("wallet unreachable: %w", commonconstants.ErrTransient)
	allTransient := make([]error, maxReleaseAttempts)
	for i := range allTransient {
		allTransient[i] = transient
	}

	tests := []struct {
		name      string
		results   []error
		wantCalls int
	}{
		{name: "released first time", results: []error{nil}, wantCalls: 1},
		{name: "transient then released", results: []error{transient, transient, nil}, wantCalls: 3},
		{name: "gives up after the attempt cap", results: allTransient, wantCalls: maxReleaseAttempts},
		{name: "a non-transient refusal is not retried", results: []error{errors.New("hold already committed")}, wantCalls: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{listing: activeListing(t, 100), updateErr: commonconstants.ErrLockUnavailable}
			wallet := &fakeWallet{releaseErrs: tt.results, releaseErr: tt.results[len(tt.results)-1]}

			err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
				ListingID: uuid.New(),
				MemberID:  uuid.New(),
				Amount:    150,
				Now:       time.Now(),
			})

			assert.ErrorIs(t, err, commonconstants.ErrLockUnavailable, "the bid's failure, never the release's")
			assert.Equal(t, tt.wantCalls, wallet.releaseCalls)
		})
	}
}
