package mailbox

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The claim protocol (FS-1GZGD R13-R17, R25-R29, ADR-0044) against fakes. The
// same guards run against a real database in claim_db_test.go.

type grantCall struct {
	grantID string
	lines   []ItemGrant
}

// GrantItems is items-service's grant: idempotent by grant id, all or nothing.
// While grantErr is set it mints nothing and answers that error.
func (f *fakeItems) GrantItems(ctx context.Context, grantID string, lines []ItemGrant) (*Grant, error) {
	f.mu.Lock()
	f.grantCalls = append(f.grantCalls, grantCall{grantID: grantID, lines: lines})
	if _, ok := ctx.Deadline(); ok {
		f.hadDeadline = true
	}
	entered, release := f.entered, f.release
	f.mu.Unlock()

	if entered != nil {
		entered <- struct{}{}
	}
	if release != nil {
		select {
		case <-release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.grantErr != nil {
		return nil, f.grantErr
	}
	if ids, ok := f.granted[grantID]; ok {
		return &Grant{ItemIDs: ids, AlreadyGranted: true}, nil
	}
	var ids []uuid.UUID
	for _, l := range lines {
		for i := int32(0); i < l.Quantity; i++ {
			ids = append(ids, uuid.New())
		}
	}
	if f.granted == nil {
		f.granted = map[string][]uuid.UUID{}
	}
	f.granted[grantID] = ids
	return &Grant{ItemIDs: ids}, nil
}

func (f *fakeItems) grants() []grantCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]grantCall(nil), f.grantCalls...)
}

// minted counts the grants items applied: one per grant id, however often sent.
func (f *fakeItems) minted() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.granted)
}

type creditCall struct {
	amount int64
	key    string
}

// fakeWallet is wallet-service's Credit: idempotent by key. While err is set
// it credits nothing and answers err.
type fakeWallet struct {
	mu       sync.Mutex
	calls    []creditCall
	credited map[string]int64
	err      error
}

func (f *fakeWallet) Credit(_ context.Context, amount int64, key string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, creditCall{amount: amount, key: key})
	if f.err != nil {
		return false, f.err
	}
	if _, ok := f.credited[key]; ok {
		return false, nil
	}
	if f.credited == nil {
		f.credited = map[string]int64{}
	}
	f.credited[key] = amount
	return true, nil
}

func (f *fakeWallet) creditCalls() []creditCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]creditCall(nil), f.calls...)
}

// total is the gold that actually moved, every key counted once.
func (f *fakeWallet) total() int64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	var sum int64
	for _, amount := range f.credited {
		sum += amount
	}
	return sum
}

func (f *fakeRepo) EnsureState(_ context.Context, letterID, member uuid.UUID) error {
	if f.states == nil {
		f.states = map[stateKey]*fakeState{}
	}
	k := stateKey{letterID, member}
	if f.states[k] == nil {
		f.states[k] = &fakeState{claim: ClaimUnclaimed}
	}
	return nil
}

func (f *fakeRepo) LockState(_ context.Context, _ sqlx.ExtContext, letterID, member uuid.UUID) (ClaimState, error) {
	if f.locked {
		return "", ErrStateLocked
	}
	st := f.states[stateKey{letterID, member}]
	if st == nil {
		return "", errors.New("no state row")
	}
	return st.claim, nil
}

func (f *fakeRepo) StartClaim(_ context.Context, _ sqlx.ExtContext, letterID, member uuid.UUID, at time.Time) error {
	st := f.states[stateKey{letterID, member}]
	if st.claim == ClaimClaimed {
		return errors.New("start claim of a claimed letter")
	}
	st.claim = ClaimClaiming
	if st.readAt == nil {
		st.readAt = &at
	}
	return nil
}

func (f *fakeRepo) FinishClaim(_ context.Context, _ sqlx.ExtContext, letterID, member uuid.UUID) error {
	if f.finishErr != nil {
		return f.finishErr
	}
	st := f.states[stateKey{letterID, member}]
	if st.claim != ClaimClaiming {
		return errors.New("finish claim of a letter not claiming")
	}
	st.claim = ClaimClaimed
	return nil
}

func (f *fakeRepo) state(letterID, member uuid.UUID) ClaimState {
	st := f.states[stateKey{letterID, member}]
	if st == nil {
		return ""
	}
	return st.claim
}

// claimKeyOf is the one key both steps carry (R14): derived from letter id +
// member id, so every attempt of one claim sends the same one.
func claimKeyOf(letter, member uuid.UUID) string {
	return "mail:" + letter.String() + ":" + member.String()
}

func letterWith(member uuid.UUID, enclosures ...Enclosure) *Letter {
	l := letterTo(&member, now.Add(-time.Hour), enclosures...)
	return &l
}

func itemsOf(quantity int32, snap *ItemSnapshot) Enclosure {
	return Enclosure{Kind: EnclosureItem, Quantity: quantity, Item: snap}
}

func goldOf(amount int64) Enclosure {
	return Enclosure{Kind: EnclosureGold, Gold: amount}
}

func TestClaimLetter_TakesEveryEnclosureAndMarksTheLetterClaimedAndRead(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, itemsOf(1, potion), itemsOf(3, unique), goldOf(500))
	repo, itemsSvc, wallet := &fakeRepo{found: letter}, &fakeItems{}, &fakeWallet{}

	got, err := newClaimService(repo, itemsSvc, wallet).ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)

	key := claimKeyOf(letter.ID, member)
	grants := itemsSvc.grants()
	require.Len(t, grants, 1)
	assert.Equal(t, key, grants[0].grantID)
	assert.Equal(t, []ItemGrant{{Snapshot: potion, Quantity: 1}, {Snapshot: unique, Quantity: 3}}, grants[0].lines,
		"the stored snapshots with their quantities, in letter order")
	assert.Zero(t, itemsSvc.calls, "a claim resolves nothing again (A2)")
	assert.True(t, itemsSvc.hadDeadline, "the steps run under a deadline, so the row lock is bounded")

	assert.Equal(t, []creditCall{{amount: 500, key: key}}, wallet.creditCalls())

	assert.Equal(t, letter.ID, got.LetterID)
	assert.Len(t, got.ItemIDs, 4)
	assert.Equal(t, itemsSvc.granted[key], got.ItemIDs)
	assert.Equal(t, int64(500), got.Gold)

	assert.Equal(t, ClaimClaimed, repo.state(letter.ID, member))
	require.NotNil(t, repo.states[stateKey{letter.ID, member}].readAt, "claiming marks the letter read")
	assert.True(t, repo.states[stateKey{letter.ID, member}].readAt.Equal(now))
}

func TestClaimLetter_GoldOnlyNeverCallsItems(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, goldOf(75))
	repo, itemsSvc, wallet := &fakeRepo{found: letter}, &fakeItems{}, &fakeWallet{}

	got, err := newClaimService(repo, itemsSvc, wallet).ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)

	assert.Empty(t, itemsSvc.grants())
	assert.Equal(t, []creditCall{{amount: 75, key: claimKeyOf(letter.ID, member)}}, wallet.creditCalls())
	assert.NotNil(t, got.ItemIDs)
	assert.Empty(t, got.ItemIDs)
	assert.Equal(t, int64(75), got.Gold)
	assert.Equal(t, ClaimClaimed, repo.state(letter.ID, member))
}

func TestClaimLetter_ItemOnlyNeverCallsWallet(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, itemsOf(2, potion))
	repo, itemsSvc, wallet := &fakeRepo{found: letter}, &fakeItems{}, &fakeWallet{}

	got, err := newClaimService(repo, itemsSvc, wallet).ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)

	assert.Len(t, itemsSvc.grants(), 1)
	assert.Empty(t, wallet.creditCalls())
	assert.Len(t, got.ItemIDs, 2)
	assert.Zero(t, got.Gold)
	assert.Equal(t, ClaimClaimed, repo.state(letter.ID, member))
}

// Every refusal is decided before either step is called (R13, R25, S5).
func TestClaimLetter_RefusalsCallNeitherItemsNorWallet(t *testing.T) {
	member := uuid.New()
	full := func() *Letter { return letterWith(member, itemsOf(1, potion), goldOf(5)) }

	cases := []struct {
		name    string
		repo    func() *fakeRepo
		wantErr error
		want    errcode.Code
	}{
		{
			name:    "not addressed to the caller",
			repo:    func() *fakeRepo { return &fakeRepo{findErr: ErrLetterNotFound} },
			wantErr: ErrLetterNotFound,
		},
		{
			name: "expired",
			repo: func() *fakeRepo {
				l := full()
				l.ExpiresAt = now
				return &fakeRepo{found: l}
			},
			want: errcode.LetterExpired,
		},
		{
			name: "without enclosures",
			repo: func() *fakeRepo { return &fakeRepo{found: letterWith(member)} },
			want: errcode.NothingToClaim,
		},
		{
			name: "already claimed",
			repo: func() *fakeRepo {
				l := full()
				return &fakeRepo{found: l, states: map[stateKey]*fakeState{{l.ID, member}: {claim: ClaimClaimed}}}
			},
			want: errcode.LetterAlreadyClaimed,
		},
		{
			name: "another claim holds the lock",
			repo: func() *fakeRepo { return &fakeRepo{found: full(), locked: true} },
			want: errcode.LetterClaimInProgress,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo, itemsSvc, wallet := tc.repo(), &fakeItems{}, &fakeWallet{}

			_, err := newClaimService(repo, itemsSvc, wallet).ClaimLetter(context.Background(), uuid.New(), member)

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			} else {
				assertRefused(t, err, tc.want)
			}
			assert.Empty(t, itemsSvc.grants())
			assert.Empty(t, wallet.creditCalls())
		})
	}
}

func TestClaimLetter_StashFullCreditsNothingAndStaysClaimable(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, itemsOf(3, potion), goldOf(500))
	repo := &fakeRepo{found: letter}
	itemsSvc := &fakeItems{grantErr: errcode.Refuse(errcode.StashFull)}
	wallet := &fakeWallet{}
	svc := newClaimService(repo, itemsSvc, wallet)

	_, err := svc.ClaimLetter(context.Background(), letter.ID, member)
	assertRefused(t, err, errcode.StashFull)
	assert.Zero(t, itemsSvc.minted())
	assert.Empty(t, wallet.creditCalls(), "gold waits until the items are in")
	assert.NotEqual(t, ClaimClaimed, repo.state(letter.ID, member))

	// slots freed
	itemsSvc.grantErr = nil
	got, err := svc.ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)
	assert.Len(t, got.ItemIDs, 3)
	assert.Equal(t, int64(500), wallet.total())
	assert.Equal(t, ClaimClaimed, repo.state(letter.ID, member))
}

func TestClaimLetter_WalletFailureLeavesItClaimingAndTheRetryCreditsOnce(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, itemsOf(1, potion), itemsOf(3, unique), goldOf(500))
	repo := &fakeRepo{found: letter}
	itemsSvc := &fakeItems{}
	wallet := &fakeWallet{err: ErrWalletUnavailable}
	svc := newClaimService(repo, itemsSvc, wallet)

	_, err := svc.ClaimLetter(context.Background(), letter.ID, member)
	assert.ErrorIs(t, err, ErrWalletUnavailable)
	assert.Equal(t, ClaimClaiming, repo.state(letter.ID, member))
	assert.Equal(t, 1, itemsSvc.minted(), "the items are in the stash")

	wallet.err = nil
	got, err := svc.ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)

	key := claimKeyOf(letter.ID, member)
	grants := itemsSvc.grants()
	require.Len(t, grants, 2)
	assert.Equal(t, key, grants[0].grantID)
	assert.Equal(t, key, grants[1].grantID, "the same grant id on every attempt")
	assert.Equal(t, 1, itemsSvc.minted(), "one set of items")
	assert.Equal(t, itemsSvc.granted[key], got.ItemIDs, "the first grant's ids")

	calls := wallet.creditCalls()
	require.Len(t, calls, 2)
	assert.Equal(t, calls[0], calls[1], "the same credit key and amount on every attempt")
	assert.Equal(t, key, calls[1].key)
	assert.Equal(t, int64(500), wallet.total(), "the gold once")
	assert.Equal(t, ClaimClaimed, repo.state(letter.ID, member))
}

// Guard 3: the grant applied, the row left claiming (the crash).
func TestClaimLetter_ACrashedClaimIsFinishedWithoutASecondSet(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, itemsOf(2, potion), goldOf(40))
	key := claimKeyOf(letter.ID, member)
	firstIDs := []uuid.UUID{uuid.New(), uuid.New()}
	repo := &fakeRepo{found: letter, states: map[stateKey]*fakeState{{letter.ID, member}: {claim: ClaimClaiming}}}
	itemsSvc := &fakeItems{granted: map[string][]uuid.UUID{key: firstIDs}}
	wallet := &fakeWallet{}

	got, err := newClaimService(repo, itemsSvc, wallet).ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)

	assert.Equal(t, firstIDs, got.ItemIDs)
	assert.Equal(t, 1, itemsSvc.minted())
	assert.Equal(t, int64(40), wallet.total())
	assert.Equal(t, ClaimClaimed, repo.state(letter.ID, member))
}

func TestClaimLetter_ItemsDownIsUnavailableAndRetryable(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, itemsOf(1, potion), goldOf(5))
	repo := &fakeRepo{found: letter}
	itemsSvc := &fakeItems{grantErr: ErrItemsUnavailable}
	wallet := &fakeWallet{}

	_, err := newClaimService(repo, itemsSvc, wallet).ClaimLetter(context.Background(), letter.ID, member)
	assert.ErrorIs(t, err, ErrItemsUnavailable)
	assert.Empty(t, wallet.creditCalls())
	assert.NotEqual(t, ClaimClaimed, repo.state(letter.ID, member))
}

// Recording claimed is the last write: if it fails, the claim fails and the
// next one re-sends both steps, which answer already done.
func TestClaimLetter_FailingToRecordClaimedFailsTheClaim(t *testing.T) {
	member := uuid.New()
	letter := letterWith(member, goldOf(5))
	repo := &fakeRepo{found: letter, finishErr: errors.New("connection reset")}

	_, err := newClaimService(repo, &fakeItems{}, &fakeWallet{}).ClaimLetter(context.Background(), letter.ID, member)
	require.Error(t, err)
	assert.NotEqual(t, ClaimClaimed, repo.state(letter.ID, member))
}
