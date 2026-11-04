package mailbox

import (
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/inbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The no-duplicate-claim guards (FS-1GZGD R25-R29, D20) against a real
// postgres: the row lock and the conditional move are SQL, so only a database
// can show two claims never both get through. items and wallet are fakes that
// count what they applied.

func claimDBService(t *testing.T, db *sqlx.DB, items *fakeItems, wallet *fakeWallet) *service {
	t.Helper()
	svc := NewService(db, NewRepository(db), items, wallet, &fakeArrivals{}, inbox.NewRepo(), 8)
	svc.now = func() time.Time { return sentAt.Add(time.Hour) }
	return svc
}

type dbState struct {
	ClaimState string       `db:"claim_state"`
	ReadAt     sql.NullTime `db:"read_at"`
}

func stateRows(t *testing.T, db *sqlx.DB, letterID, member uuid.UUID) []dbState {
	t.Helper()
	var rows []dbState
	require.NoError(t, db.Select(&rows,
		`SELECT claim_state, read_at FROM letter_states WHERE letter_id = $1 AND member_id = $2`, letterID, member))
	return rows
}

func claimStateOf(t *testing.T, db *sqlx.DB, letterID, member uuid.UUID) string {
	t.Helper()
	rows := stateRows(t, db, letterID, member)
	require.Len(t, rows, 1, "one state row per (letter, member)")
	return rows[0].ClaimState
}

type claimResult struct {
	claim *Claim
	err   error
}

// Guard 1 (concurrent), held open: while one claim is inside the items call
// holding the row lock, a second claim is refused at once and calls nothing.
func TestClaimDB_ASecondClaimWhileOneIsInFlightIsInProgress(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	letter := letterTo(&member, sentAt, itemsOf(1, potion), itemsOf(3, unique), goldOf(500))
	store(t, db, letter)

	itemsSvc := &fakeItems{entered: make(chan struct{}, 1), release: make(chan struct{})}
	wallet := &fakeWallet{}
	svc := claimDBService(t, db, itemsSvc, wallet)
	ctx := context.Background()

	first := make(chan claimResult, 1)
	go func() {
		c, err := svc.ClaimLetter(ctx, letter.ID, member)
		first <- claimResult{c, err}
	}()
	<-itemsSvc.entered // the first claim holds the row lock and is in step 1

	second := make(chan claimResult, 1)
	go func() {
		c, err := svc.ClaimLetter(ctx, letter.ID, member)
		second <- claimResult{c, err}
	}()
	select {
	case r := <-second:
		assertRefused(t, r.err, errcode.LetterClaimInProgress)
	case <-time.After(5 * time.Second):
		close(itemsSvc.release)
		t.Fatal("the second claim waited for the lock instead of being refused at once")
	}
	assert.Len(t, itemsSvc.grants(), 1, "the refused claim called nothing")
	assert.Empty(t, wallet.creditCalls())

	close(itemsSvc.release)
	r := <-first
	require.NoError(t, r.err)
	assert.Len(t, r.claim.ItemIDs, 4)
	assert.Equal(t, int64(500), r.claim.Gold)

	assert.Equal(t, 1, itemsSvc.minted(), "one grant")
	assert.Equal(t, int64(500), wallet.total(), "one credit")
	rows := stateRows(t, db, letter.ID, member)
	require.Len(t, rows, 1)
	assert.Equal(t, "claimed", rows[0].ClaimState)
	assert.True(t, rows[0].ReadAt.Valid, "claiming marks the letter read")

	// Guard 1 (sequential): a claimed letter calls neither items nor wallet.
	_, err := svc.ClaimLetter(ctx, letter.ID, member)
	assertRefused(t, err, errcode.LetterAlreadyClaimed)
	assert.Len(t, itemsSvc.grants(), 1)
	assert.Len(t, wallet.creditCalls(), 1)
}

// Guard 1 (concurrent), started together: of many claims of one broadcast by
// one member released at once, exactly one succeeds; the rest are refused in
// progress or already claimed. One grant, one credit.
func TestClaimDB_ClaimsStartedTogetherSucceedOnce(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	letter := letterTo(nil, sentAt, itemsOf(2, potion), goldOf(500))
	store(t, db, letter)

	itemsSvc, wallet := &fakeItems{}, &fakeWallet{}
	svc := claimDBService(t, db, itemsSvc, wallet)

	const claims = 8
	start := make(chan struct{})
	results := make(chan claimResult, claims)
	var wg sync.WaitGroup
	for i := 0; i < claims; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			c, err := svc.ClaimLetter(context.Background(), letter.ID, member)
			results <- claimResult{c, err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	succeeded := 0
	for r := range results {
		if r.err == nil {
			succeeded++
			continue
		}
		var refusal *errcode.Refusal
		require.ErrorAs(t, r.err, &refusal)
		assert.Contains(t, []errcode.Code{errcode.LetterClaimInProgress, errcode.LetterAlreadyClaimed}, refusal.Code)
	}
	assert.Equal(t, 1, succeeded, "exactly one claim succeeds")
	assert.Len(t, itemsSvc.grants(), 1, "one grant call")
	assert.Len(t, wallet.creditCalls(), 1, "one credit call")
	assert.Equal(t, int64(500), wallet.total())
	assert.Equal(t, "claimed", claimStateOf(t, db, letter.ID, member))
}

// Items succeeded, wallet failed: the row stays claiming; the retry gets
// already-granted, credits once and marks claimed.
func TestClaimDB_WalletFailureThenRetryCreditsTheGoldOnce(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	letter := letterTo(&member, sentAt, itemsOf(1, potion), goldOf(500))
	store(t, db, letter)

	itemsSvc := &fakeItems{}
	wallet := &fakeWallet{err: ErrWalletUnavailable}
	svc := claimDBService(t, db, itemsSvc, wallet)
	ctx := context.Background()

	_, err := svc.ClaimLetter(ctx, letter.ID, member)
	assert.ErrorIs(t, err, ErrWalletUnavailable)
	assert.Equal(t, "claiming", claimStateOf(t, db, letter.ID, member))
	assert.Equal(t, 1, itemsSvc.minted())

	wallet.err = nil
	got, err := svc.ClaimLetter(ctx, letter.ID, member)
	require.NoError(t, err)

	assert.Equal(t, 1, itemsSvc.minted(), "one set of items")
	assert.Equal(t, itemsSvc.granted[claimKeyOf(letter.ID, member)], got.ItemIDs)
	assert.Equal(t, int64(500), wallet.total(), "the gold once")
	assert.Equal(t, "claimed", claimStateOf(t, db, letter.ID, member))
}

// STASH_FULL: nothing minted or credited, the letter stays claimable, and the
// same claim succeeds once slots are free.
func TestClaimDB_StashFullLeavesTheLetterClaimable(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	letter := letterTo(&member, sentAt, itemsOf(3, potion), goldOf(500))
	store(t, db, letter)

	itemsSvc := &fakeItems{grantErr: errcode.Refuse(errcode.StashFull)}
	wallet := &fakeWallet{}
	svc := claimDBService(t, db, itemsSvc, wallet)
	ctx := context.Background()

	_, err := svc.ClaimLetter(ctx, letter.ID, member)
	assertRefused(t, err, errcode.StashFull)
	assert.Zero(t, itemsSvc.minted())
	assert.Empty(t, wallet.creditCalls())
	assert.Equal(t, "unclaimed", claimStateOf(t, db, letter.ID, member), "the letter stays unclaimed")

	summary, err := NewRepository(db).Summary(ctx, member, sentAt.Add(time.Hour))
	require.NoError(t, err)
	assert.Equal(t, 1, summary.Unclaimed, "still counted unclaimed")

	itemsSvc.grantErr = nil
	got, err := svc.ClaimLetter(ctx, letter.ID, member)
	require.NoError(t, err)
	assert.Len(t, got.ItemIDs, 3)
	assert.Equal(t, int64(500), wallet.total())
	assert.Equal(t, "claimed", claimStateOf(t, db, letter.ID, member))
}

// Guard 3: the grant applied in items and the row left claiming by a crash;
// the next claim finishes it with one set of items.
func TestClaimDB_ACrashedClaimIsFinished(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	letter := letterTo(&member, sentAt, itemsOf(2, potion), goldOf(40))
	store(t, db, letter)
	_, err := db.Exec(`INSERT INTO letter_states (letter_id, member_id, claim_state) VALUES ($1, $2, 'claiming')`, letter.ID, member)
	require.NoError(t, err)

	key := claimKeyOf(letter.ID, member)
	firstIDs := []uuid.UUID{uuid.New(), uuid.New()}
	itemsSvc := &fakeItems{granted: map[string][]uuid.UUID{key: firstIDs}}
	wallet := &fakeWallet{}

	got, err := claimDBService(t, db, itemsSvc, wallet).ClaimLetter(context.Background(), letter.ID, member)
	require.NoError(t, err)

	grants := itemsSvc.grants()
	require.Len(t, grants, 1)
	assert.Equal(t, key, grants[0].grantID, "the same grant id the crashed claim sent")
	assert.Equal(t, firstIDs, got.ItemIDs)
	assert.Equal(t, 1, itemsSvc.minted())
	assert.Equal(t, int64(40), wallet.total())
	assert.Equal(t, "claimed", claimStateOf(t, db, letter.ID, member))
}

// A refused claim before the lock (expired, not addressed, nothing to claim)
// writes no state row.
func TestClaimDB_RefusalsBeforeTheLockWriteNothing(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	expired := letterTo(&member, sentAt.Add(-40*24*time.Hour), goldOf(5))
	plain := letterTo(&member, sentAt)
	toOther := letterTo(ptr(uuid.New()), sentAt, goldOf(5))
	store(t, db, expired, plain, toOther)

	itemsSvc, wallet := &fakeItems{}, &fakeWallet{}
	svc := claimDBService(t, db, itemsSvc, wallet)
	ctx := context.Background()

	_, err := svc.ClaimLetter(ctx, expired.ID, member)
	assertRefused(t, err, errcode.LetterExpired)
	_, err = svc.ClaimLetter(ctx, plain.ID, member)
	assertRefused(t, err, errcode.NothingToClaim)
	_, err = svc.ClaimLetter(ctx, toOther.ID, member)
	assert.ErrorIs(t, err, ErrLetterNotFound)

	assert.Equal(t, 0, countRows(t, db, "letter_states"))
	assert.Empty(t, itemsSvc.grants())
	assert.Empty(t, wallet.creditCalls())
}

// The claim cap against a real pool: claims in flight each hold a connection
// for their whole steps, so with the cap taken the next claim is answered busy
// at once, and the reads, the summary and mark read still get a connection and
// answer promptly instead of queueing behind the claims (ADR-0044
// §Consequences).
func TestClaimDB_WithTheCapTakenReadsStillAnswerPromptly(t *testing.T) {
	db := mailboxDB(t)
	const pool, maxClaims = 3, 2
	db.SetMaxOpenConns(pool)

	member := uuid.New()
	held := []Letter{
		letterTo(&member, sentAt, itemsOf(1, potion)),
		letterTo(&member, sentAt, itemsOf(1, potion)),
	}
	extra := letterTo(&member, sentAt, goldOf(5))
	store(t, db, held[0], held[1], extra)

	itemsSvc := &fakeItems{entered: make(chan struct{}, maxClaims), release: make(chan struct{})}
	wallet := &fakeWallet{}
	svc := NewService(db, NewRepository(db), itemsSvc, wallet, &fakeArrivals{}, inbox.NewRepo(), maxClaims)
	svc.now = func() time.Time { return sentAt.Add(time.Hour) }
	ctx := context.Background()

	done := make(chan error, len(held))
	for _, l := range held {
		go func(id uuid.UUID) {
			_, err := svc.ClaimLetter(ctx, id, member)
			done <- err
		}(l.ID)
	}
	for range held {
		<-itemsSvc.entered // each holds its row lock and a connection
	}
	defer func() {
		select {
		case <-itemsSvc.release:
		default:
			close(itemsSvc.release)
		}
	}()

	prompt := func(name string, call func(ctx context.Context) error) error {
		t.Helper()
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		start := time.Now()
		err := call(ctx)
		assert.Less(t, time.Since(start), time.Second, "%s answered promptly", name)
		return err
	}

	err := prompt("a claim over the cap", func(ctx context.Context) error {
		_, err := svc.ClaimLetter(ctx, extra.ID, member)
		return err
	})
	assert.ErrorIs(t, err, ErrClaimsBusy)
	assert.Empty(t, wallet.creditCalls(), "the busy claim called nothing")

	require.NoError(t, prompt("the summary", func(ctx context.Context) error {
		_, err := svc.MailboxSummary(ctx, member)
		return err
	}))
	require.NoError(t, prompt("the letters", func(ctx context.Context) error {
		_, err := svc.ListLetters(ctx, member)
		return err
	}))
	require.NoError(t, prompt("mark read", func(ctx context.Context) error {
		return svc.MarkLetterRead(ctx, extra.ID, member)
	}))

	close(itemsSvc.release)
	for range held {
		require.NoError(t, <-done)
	}
	for _, l := range held {
		assert.Equal(t, "claimed", claimStateOf(t, db, l.ID, member))
	}
	_, err = svc.ClaimLetter(ctx, extra.ID, member)
	require.NoError(t, err, "with the slots free the claim goes through")
}

// Mark read never waits on a claim in flight (R8, R13): the claim holds the
// state row locked across its items and wallet calls, and already records the
// read, so mark read skips a locked row and answers at once instead of
// holding a connection until the claim ends.
func TestClaimDB_MarkReadDoesNotWaitOnAClaimInFlight(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	letter := letterTo(&member, sentAt, itemsOf(1, potion))
	store(t, db, letter)

	itemsSvc := &fakeItems{entered: make(chan struct{}, 1), release: make(chan struct{})}
	svc := claimDBService(t, db, itemsSvc, &fakeWallet{})
	ctx := context.Background()

	claimed := make(chan error, 1)
	go func() {
		_, err := svc.ClaimLetter(ctx, letter.ID, member)
		claimed <- err
	}()
	<-itemsSvc.entered // the claim holds the row lock

	read := make(chan error, 1)
	go func() { read <- svc.MarkLetterRead(ctx, letter.ID, member) }()
	select {
	case err := <-read:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		close(itemsSvc.release)
		<-read
		t.Fatal("mark read waited for the claim's row lock")
	}

	close(itemsSvc.release)
	require.NoError(t, <-claimed)
	rows := stateRows(t, db, letter.ID, member)
	require.Len(t, rows, 1)
	assert.Equal(t, "claimed", rows[0].ClaimState)
	assert.True(t, rows[0].ReadAt.Valid, "the claim recorded the read")
}

// The other direction: a mark read of a letter already read takes no lock on
// its state row, so it never makes a claim's NOWAIT refuse a spurious
// LETTER_CLAIM_IN_PROGRESS. Each claim here runs while mark reads of its
// letter are repeated as fast as they go.
func TestClaimDB_MarkReadNeverMakesAClaimInProgress(t *testing.T) {
	db := mailboxDB(t)
	member := uuid.New()
	itemsSvc, wallet := &fakeItems{}, &fakeWallet{}
	svc := claimDBService(t, db, itemsSvc, wallet)
	ctx := context.Background()

	const letters, readers = 25, 4
	for i := 0; i < letters; i++ {
		letter := letterTo(&member, sentAt, goldOf(1))
		store(t, db, letter)
		require.NoError(t, svc.MarkLetterRead(ctx, letter.ID, member)) // opened before Take

		stop := make(chan struct{})
		reading := make(chan error, readers)
		for r := 0; r < readers; r++ {
			go func() {
				for {
					select {
					case <-stop:
						reading <- nil
						return
					default:
					}
					if err := svc.MarkLetterRead(ctx, letter.ID, member); err != nil {
						reading <- err
						return
					}
				}
			}()
		}
		time.Sleep(5 * time.Millisecond) // the readers are running

		_, err := svc.ClaimLetter(ctx, letter.ID, member)
		close(stop)
		for r := 0; r < readers; r++ {
			require.NoError(t, <-reading)
		}
		require.NoError(t, err, "claim %d of %d", i+1, letters)
	}
	assert.Equal(t, int64(letters), wallet.total())
}
