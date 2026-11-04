package mailbox

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeRepo records what the service stored and answers canned reads.
type fakeRepo struct {
	inserted  [][]Letter
	insertErr error

	listed    []MailboxLetter
	listArgs  []any
	summary   Summary
	sumArgs   []any
	found     *Letter
	findErr   error
	markedAt  []time.Time
	markedFor []uuid.UUID

	// claim state rows by (letter, member); locked stands in for another
	// claim holding the row lock
	states    map[stateKey]*fakeState
	locked    bool
	finishErr error
}

type stateKey struct{ letter, member uuid.UUID }

type fakeState struct {
	claim  ClaimState
	readAt *time.Time
}

func (f *fakeRepo) InsertLetters(_ context.Context, _ sqlx.ExtContext, letters []Letter) error {
	if f.insertErr != nil {
		return f.insertErr
	}
	f.inserted = append(f.inserted, letters)
	return nil
}

func (f *fakeRepo) ListLetters(_ context.Context, member uuid.UUID, now time.Time, limit int) ([]MailboxLetter, error) {
	f.listArgs = []any{member, now, limit}
	return f.listed, nil
}

func (f *fakeRepo) Summary(_ context.Context, member uuid.UUID, now time.Time) (Summary, error) {
	f.sumArgs = []any{member, now}
	return f.summary, nil
}

func (f *fakeRepo) FindAddressed(_ context.Context, _, _ uuid.UUID) (*Letter, error) {
	return f.found, f.findErr
}

func (f *fakeRepo) MarkRead(_ context.Context, _, member uuid.UUID, at time.Time) error {
	f.markedAt = append(f.markedAt, at)
	f.markedFor = append(f.markedFor, member)
	return nil
}

// fakeItems resolves every template to potion at the asked level (or 1) and
// every instance to unique, unless told an id is unknown or unrepresentable.
type fakeItems struct {
	calls     int
	templates []TemplateRef
	instances []uuid.UUID

	unknownTemplates map[uuid.UUID]bool
	unknownInstances map[uuid.UUID]bool
	unrepresentable  map[uuid.UUID]bool
	err              error

	// GrantItems (claim_test.go): grants applied by grant id, every call made,
	// and an optional gate a test holds a claim in
	mu          sync.Mutex
	grantCalls  []grantCall
	granted     map[string][]uuid.UUID
	grantErr    error
	hadDeadline bool
	entered     chan struct{}
	release     chan struct{}
}

func (f *fakeItems) ResolveItemSnapshots(_ context.Context, templates []TemplateRef, instances []uuid.UUID) (*Resolution, error) {
	f.calls++
	f.templates = templates
	f.instances = instances
	if f.err != nil {
		return nil, f.err
	}
	res := &Resolution{}
	for _, t := range templates {
		switch {
		case f.unknownTemplates[t.TemplateID]:
			res.Templates = append(res.Templates, nil)
			res.UnknownTemplateIDs = append(res.UnknownTemplateIDs, t.TemplateID)
		case f.unrepresentable[t.TemplateID]:
			res.Templates = append(res.Templates, nil)
			res.UnrepresentableIDs = append(res.UnrepresentableIDs, t.TemplateID)
		default:
			snap := *potion
			snap.TemplateID = t.TemplateID
			if t.ItemLevel != nil {
				snap.ItemLevel = *t.ItemLevel
			}
			res.Templates = append(res.Templates, &snap)
		}
	}
	for _, id := range instances {
		switch {
		case f.unknownInstances[id]:
			res.Instances = append(res.Instances, nil)
			res.UnknownInstanceIDs = append(res.UnknownInstanceIDs, id)
		case f.unrepresentable[id]:
			res.Instances = append(res.Instances, nil)
			res.UnrepresentableIDs = append(res.UnrepresentableIDs, id)
		default:
			snap := *unique
			res.Instances = append(res.Instances, &snap)
		}
	}
	return res, nil
}

var now = time.Date(2026, 11, 4, 9, 30, 0, 0, time.UTC)

func newTestService(repo *fakeRepo, items *fakeItems) *service {
	return newClaimService(repo, items, &fakeWallet{})
}

func newClaimService(repo *fakeRepo, items *fakeItems, wallet *fakeWallet) *service {
	return &service{
		repo:     repo,
		items:    items,
		wallet:   wallet,
		arrivals: &fakeArrivals{},
		withTx: func(_ context.Context, fn func(tx *sqlx.Tx) error) error {
			return fn(nil)
		},
		now: func() time.Time { return now },
	}
}

var (
	admin  = commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RoleAdmin}
	player = commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RolePlayer}
)

func toMember(id uuid.UUID) Recipient {
	return Recipient{Kind: RecipientMember, MemberIDs: []uuid.UUID{id}}
}

func toList(ids ...uuid.UUID) Recipient {
	return Recipient{Kind: RecipientMemberList, MemberIDs: ids}
}

var toAll = Recipient{Kind: RecipientAllMembers}

func draft(r Recipient, enclosures ...EnclosureRequest) LetterDraft {
	return LetterDraft{Recipient: r, Title: "From the Wardens", Body: "Well met.", Enclosures: enclosures}
}

func templateOf(id uuid.UUID, quantity int32) EnclosureRequest {
	return EnclosureRequest{Kind: RequestTemplate, TemplateID: id, Quantity: quantity}
}

func copyOf(id uuid.UUID, quantity int32) EnclosureRequest {
	return EnclosureRequest{Kind: RequestCopy, CopyOf: id, Quantity: quantity}
}

func gold(amount int64) EnclosureRequest {
	return EnclosureRequest{Kind: RequestGold, Gold: amount}
}

func assertRefused(t *testing.T, err error, want errcode.Code) {
	t.Helper()
	var refusal *errcode.Refusal
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, want, refusal.Code)
}

func TestSendLetter_NonAdminIsRefusedAndNothingHappens(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	_, err := newTestService(repo, items).SendLetter(context.Background(), player,
		draft(toMember(uuid.New()), templateOf(uuid.New(), 1)))

	assert.ErrorIs(t, err, ErrNotAdmin)
	assert.Empty(t, repo.inserted)
	assert.Zero(t, items.calls)
}

func TestSendLetter_OneMemberStoresOneOfficialLetterThatExpiresIn30Days(t *testing.T) {
	repo := &fakeRepo{}
	member := uuid.New()

	got, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(toMember(member)))
	require.NoError(t, err)

	require.Len(t, repo.inserted, 1)
	require.Len(t, repo.inserted[0], 1)
	l := repo.inserted[0][0]
	assert.Equal(t, SenderOfficial, l.Sender)
	require.NotNil(t, l.MemberID)
	assert.Equal(t, member, *l.MemberID)
	assert.Equal(t, "From the Wardens", l.Title)
	assert.Equal(t, "Well met.", l.Body)
	assert.Equal(t, now, l.SentAt)
	assert.Equal(t, now.Add(30*24*time.Hour), l.ExpiresAt)
	assert.Empty(t, l.Enclosures)

	assert.Equal(t, now.Add(30*24*time.Hour), got.ExpiresAt)
	require.Len(t, got.Letters, 1)
	assert.Equal(t, l.ID, got.Letters[0].LetterID)
	require.NotNil(t, got.Letters[0].MemberID)
	assert.Equal(t, member, *got.Letters[0].MemberID)
}

func TestSendLetter_BroadcastStoresOneLetterForEveryMember(t *testing.T) {
	repo := &fakeRepo{}

	got, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(toAll))
	require.NoError(t, err)

	require.Len(t, repo.inserted, 1)
	require.Len(t, repo.inserted[0], 1)
	assert.Nil(t, repo.inserted[0][0].MemberID)
	require.Len(t, got.Letters, 1)
	assert.Nil(t, got.Letters[0].MemberID, "a broadcast answers one entry without a member")
}

func TestSendLetter_GivenExpiryIsKept(t *testing.T) {
	repo := &fakeRepo{}
	expiry := now.Add(48 * time.Hour)
	d := draft(toAll)
	d.ExpiresAt = &expiry

	got, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, d)
	require.NoError(t, err)
	assert.Equal(t, expiry, repo.inserted[0][0].ExpiresAt)
	assert.Equal(t, expiry, got.ExpiresAt)
}

func TestSendLetter_TrimsTitleAndBody(t *testing.T) {
	repo := &fakeRepo{}
	d := draft(toAll)
	d.Title, d.Body = "  Hail  ", "\n Well met. \n"

	_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, d)
	require.NoError(t, err)
	assert.Equal(t, "Hail", repo.inserted[0][0].Title)
	assert.Equal(t, "Well met.", repo.inserted[0][0].Body)
}

func TestSendLetter_LengthsCountCharactersNotBytes(t *testing.T) {
	repo := &fakeRepo{}
	d := draft(toAll)
	d.Title = strings.Repeat("é", 60)
	d.Body = strings.Repeat("骨", 2000)

	_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, d)
	require.NoError(t, err)
	assert.Len(t, repo.inserted, 1)
}

func TestSendLetter_BoundViolationsAreRefusedAndStoreNothing(t *testing.T) {
	tmpl := uuid.New()
	past := now.Add(-time.Second)
	cases := []struct {
		name string
		edit func(d *LetterDraft)
		want errcode.Code
	}{
		{"title 61", func(d *LetterDraft) { d.Title = strings.Repeat("a", 61) }, errcode.LetterTitleInvalid},
		{"empty title", func(d *LetterDraft) { d.Title = "   " }, errcode.LetterTitleInvalid},
		{"body 2001", func(d *LetterDraft) { d.Body = strings.Repeat("a", 2001) }, errcode.LetterBodyInvalid},
		{"empty body", func(d *LetterDraft) { d.Body = "" }, errcode.LetterBodyInvalid},
		{"11 enclosures", func(d *LetterDraft) {
			for i := 0; i < 11; i++ {
				d.Enclosures = append(d.Enclosures, templateOf(tmpl, 1))
			}
		}, errcode.EnclosureInvalid},
		{"two gold enclosures", func(d *LetterDraft) { d.Enclosures = []EnclosureRequest{gold(1), gold(2)} }, errcode.EnclosureInvalid},
		{"slot count 61", func(d *LetterDraft) {
			d.Enclosures = []EnclosureRequest{templateOf(tmpl, 60), copyOf(uuid.New(), 1)}
		}, errcode.EnclosureInvalid},
		{"quantity 0", func(d *LetterDraft) { d.Enclosures = []EnclosureRequest{templateOf(tmpl, 0)} }, errcode.EnclosureInvalid},
		{"quantity 61", func(d *LetterDraft) { d.Enclosures = []EnclosureRequest{copyOf(uuid.New(), 61)} }, errcode.EnclosureInvalid},
		{"gold 0", func(d *LetterDraft) { d.Enclosures = []EnclosureRequest{gold(0)} }, errcode.EnclosureInvalid},
		{"item level 0", func(d *LetterDraft) {
			e := templateOf(tmpl, 1)
			e.ItemLevel = ptr(int32(0))
			d.Enclosures = []EnclosureRequest{e}
		}, errcode.EnclosureInvalid},
		{"unknown enclosure kind", func(d *LetterDraft) { d.Enclosures = []EnclosureRequest{{Quantity: 1}} }, errcode.EnclosureInvalid},
		{"past expiry", func(d *LetterDraft) { d.ExpiresAt = &past }, errcode.LetterExpiryInvalid},
		{"expiry now", func(d *LetterDraft) { d.ExpiresAt = &now }, errcode.LetterExpiryInvalid},
	}
	for _, recipient := range []Recipient{toMember(uuid.New()), toList(uuid.New(), uuid.New()), toAll} {
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				repo, items := &fakeRepo{}, &fakeItems{}
				d := draft(recipient)
				tc.edit(&d)

				_, err := newTestService(repo, items).SendLetter(context.Background(), admin, d)

				assertRefused(t, err, tc.want)
				assert.Empty(t, repo.inserted, "a refused send stores nothing")
				assert.Zero(t, items.calls, "and resolves nothing")
			})
		}
	}
}

func TestSendLetter_BoundsAreInclusive(t *testing.T) {
	repo := &fakeRepo{}
	d := draft(toAll,
		templateOf(uuid.New(), 50), copyOf(uuid.New(), 9), gold(1),
	)
	d.Enclosures = append(d.Enclosures, templateOf(uuid.New(), 1)) // slot count 60

	_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, d)
	require.NoError(t, err)
	assert.Len(t, repo.inserted, 1)
}

func TestSendLetter_StoresTheResolvedSnapshotsWithTheirQuantitiesInOrder(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	plain, leveled, source := uuid.New(), uuid.New(), uuid.New()
	withLevel := templateOf(leveled, 1)
	withLevel.ItemLevel = ptr(int32(40))

	_, err := newTestService(repo, items).SendLetter(context.Background(), admin,
		draft(toAll, templateOf(plain, 3), gold(500), copyOf(source, 2), withLevel))
	require.NoError(t, err)

	require.Equal(t, 1, items.calls)
	require.Len(t, items.templates, 2)
	assert.Equal(t, plain, items.templates[0].TemplateID)
	assert.Nil(t, items.templates[0].ItemLevel, "no item level is left unset: the template's min level")
	assert.Equal(t, leveled, items.templates[1].TemplateID)
	assert.Equal(t, int32(40), *items.templates[1].ItemLevel)
	assert.Equal(t, []uuid.UUID{source}, items.instances)

	enc := repo.inserted[0][0].Enclosures
	require.Len(t, enc, 4)
	assert.Equal(t, EnclosureItem, enc[0].Kind)
	assert.Equal(t, int32(3), enc[0].Quantity)
	assert.Equal(t, plain, enc[0].Item.TemplateID)
	assert.Equal(t, Enclosure{Kind: EnclosureGold, Gold: 500}, enc[1])
	assert.Equal(t, int32(2), enc[2].Quantity)
	assert.Equal(t, unique.Affixes, enc[2].Item.Affixes, "a copy keeps its affixes")
	assert.Equal(t, unique.Rarity, enc[2].Item.Rarity)
	assert.Equal(t, int32(40), enc[3].Item.ItemLevel)
}

func TestSendLetter_WithoutItemEnclosuresCallsNoItemsRPC(t *testing.T) {
	items := &fakeItems{}
	_, err := newTestService(&fakeRepo{}, items).SendLetter(context.Background(), admin, draft(toAll, gold(10)))
	require.NoError(t, err)
	assert.Zero(t, items.calls)
}

func TestSendLetter_UnresolvedEnclosuresAreRefused(t *testing.T) {
	tmpl, inst := uuid.New(), uuid.New()
	cases := []struct {
		name  string
		items *fakeItems
		want  errcode.Code
	}{
		{"unknown template", &fakeItems{unknownTemplates: map[uuid.UUID]bool{tmpl: true}}, errcode.UnknownItemTemplate},
		{"unknown instance", &fakeItems{unknownInstances: map[uuid.UUID]bool{inst: true}}, errcode.UnknownItemInstance},
		{"unrepresentable copy", &fakeItems{unrepresentable: map[uuid.UUID]bool{inst: true}}, errcode.EnclosureInvalid},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeRepo{}
			_, err := newTestService(repo, tc.items).SendLetter(context.Background(), admin,
				draft(toList(uuid.New(), uuid.New()), templateOf(tmpl, 1), copyOf(inst, 1)))

			assertRefused(t, err, tc.want)
			assert.Empty(t, repo.inserted)
		})
	}
}

func TestSendLetter_ItemsDownIsUnavailableAndStoresNothing(t *testing.T) {
	repo := &fakeRepo{}
	items := &fakeItems{err: ErrItemsUnavailable}

	_, err := newTestService(repo, items).SendLetter(context.Background(), admin, draft(toAll, templateOf(uuid.New(), 1)))

	assert.ErrorIs(t, err, ErrItemsUnavailable)
	assert.Empty(t, repo.inserted)
}

func TestSendLetter_StoreFailureIsReported(t *testing.T) {
	repo := &fakeRepo{insertErr: errors.New("connection reset")}

	_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(toList(uuid.New(), uuid.New())))

	assert.ErrorIs(t, err, ErrStoreFailed)
}

// FS-1GZGD A6, R45-R51.
func TestSendLetter_MemberListStoresOneLetterPerDistinctRecipientInFirstAppearanceOrder(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	a, b := uuid.New(), uuid.New()

	got, err := newTestService(repo, items).SendLetter(context.Background(), admin,
		draft(toList(a, b, a), templateOf(uuid.New(), 2), gold(100)))
	require.NoError(t, err)

	assert.Equal(t, 1, items.calls, "enclosures are resolved once per request")
	require.Len(t, repo.inserted, 1, "one store, so one transaction")
	letters := repo.inserted[0]
	require.Len(t, letters, 2)
	assert.Equal(t, a, *letters[0].MemberID)
	assert.Equal(t, b, *letters[1].MemberID)
	assert.NotEqual(t, letters[0].ID, letters[1].ID)
	for _, l := range letters {
		assert.Equal(t, SenderOfficial, l.Sender)
		assert.Equal(t, letters[0].Title, l.Title)
		assert.Equal(t, letters[0].Body, l.Body)
		assert.Equal(t, letters[0].Enclosures, l.Enclosures)
		assert.Equal(t, letters[0].SentAt, l.SentAt)
		assert.Equal(t, letters[0].ExpiresAt, l.ExpiresAt)
	}

	require.Len(t, got.Letters, 2)
	assert.Equal(t, SentLetter{LetterID: letters[0].ID, MemberID: &a}, got.Letters[0])
	assert.Equal(t, SentLetter{LetterID: letters[1].ID, MemberID: &b}, got.Letters[1])
}

func TestSendLetter_MemberListBounds(t *testing.T) {
	distinct := func(n int) []uuid.UUID {
		ids := make([]uuid.UUID, n)
		for i := range ids {
			ids[i] = uuid.New()
		}
		return ids
	}

	t.Run("empty", func(t *testing.T) {
		repo := &fakeRepo{}
		_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(toList()))
		assertRefused(t, err, errcode.LetterRecipientsInvalid)
		assert.Empty(t, repo.inserted)
	})

	t.Run("1001 distinct", func(t *testing.T) {
		repo := &fakeRepo{}
		_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(toList(distinct(1001)...)))
		assertRefused(t, err, errcode.LetterRecipientsInvalid)
		assert.Empty(t, repo.inserted)
	})

	t.Run("1000 distinct plus duplicates", func(t *testing.T) {
		repo := &fakeRepo{}
		ids := distinct(1000)
		ids = append(ids, ids[:5]...)
		got, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(toList(ids...)))
		require.NoError(t, err)
		assert.Len(t, repo.inserted[0], 1000)
		assert.Len(t, got.Letters, 1000)
	})
}

func TestListLetters_ReadsTheCallersMailbox(t *testing.T) {
	member := uuid.New()
	repo := &fakeRepo{listed: []MailboxLetter{{Letter: letterTo(&member, now)}}}

	got, err := newTestService(repo, &fakeItems{}).ListLetters(context.Background(), member)
	require.NoError(t, err)
	assert.Len(t, got, 1)
	assert.Equal(t, []any{member, now, 50}, repo.listArgs)
}

func TestMailboxSummary_ReadsTheCallersCounts(t *testing.T) {
	member := uuid.New()
	repo := &fakeRepo{summary: Summary{Unread: 2, Unclaimed: 1, Waiting: 2}}

	got, err := newTestService(repo, &fakeItems{}).MailboxSummary(context.Background(), member)
	require.NoError(t, err)
	assert.Equal(t, repo.summary, got)
	assert.Equal(t, []any{member, now}, repo.sumArgs)
}

func TestMarkLetterRead(t *testing.T) {
	member := uuid.New()

	t.Run("records the read now", func(t *testing.T) {
		l := letterTo(nil, now.Add(-time.Hour))
		repo := &fakeRepo{found: &l}
		require.NoError(t, newTestService(repo, &fakeItems{}).MarkLetterRead(context.Background(), l.ID, member))
		assert.Equal(t, []time.Time{now}, repo.markedAt)
		assert.Equal(t, []uuid.UUID{member}, repo.markedFor)
	})

	t.Run("not addressed is not found", func(t *testing.T) {
		repo := &fakeRepo{findErr: ErrLetterNotFound}
		err := newTestService(repo, &fakeItems{}).MarkLetterRead(context.Background(), uuid.New(), member)
		assert.ErrorIs(t, err, ErrLetterNotFound)
		assert.Empty(t, repo.markedAt)
	})

	t.Run("expired is refused", func(t *testing.T) {
		l := letterTo(&member, now.Add(-31*24*time.Hour))
		l.ExpiresAt = now // expiry is the instant it stops being readable
		repo := &fakeRepo{found: &l}
		err := newTestService(repo, &fakeItems{}).MarkLetterRead(context.Background(), l.ID, member)
		assertRefused(t, err, errcode.LetterExpired)
		assert.Empty(t, repo.markedAt)
	})
}

// fakeArrivals records every batch the service announced and whether the
// letters' transaction had committed when it did.
type fakeArrivals struct {
	batches        [][]Letter
	afterCommit    []bool
	committedSoFar *bool
}

func (f *fakeArrivals) PublishArrivals(_ context.Context, letters []Letter) {
	f.batches = append(f.batches, letters)
	f.afterCommit = append(f.afterCommit, f.committedSoFar != nil && *f.committedSoFar)
}

// newSendService is newTestService whose transaction says when it commits,
// so a test can tell a publish after the commit from one inside it.
func newSendService(repo *fakeRepo, items *fakeItems) (*service, *fakeArrivals) {
	committed := false
	arrivals := &fakeArrivals{committedSoFar: &committed}
	svc := newTestService(repo, items)
	svc.arrivals = arrivals
	svc.withTx = func(_ context.Context, fn func(tx *sqlx.Tx) error) error {
		if err := fn(nil); err != nil {
			return err
		}
		committed = true
		return nil
	}
	return svc, arrivals
}

func membersOf(letters []Letter) []*uuid.UUID {
	members := make([]*uuid.UUID, 0, len(letters))
	for _, l := range letters {
		members = append(members, l.MemberID)
	}
	return members
}

// FS-1GZGD R41, R50; ADR-0045 §Decision 1.
func TestSendLetter_OneMemberLetterIsAnnouncedOnceAfterItsCommit(t *testing.T) {
	repo := &fakeRepo{}
	svc, arrivals := newSendService(repo, &fakeItems{})
	member := uuid.New()

	_, err := svc.SendLetter(context.Background(), admin, draft(toMember(member)))

	require.NoError(t, err)
	require.Len(t, arrivals.batches, 1)
	assert.Equal(t, repo.inserted[0], arrivals.batches[0], "the stored letters are the ones announced")
	assert.Equal(t, []*uuid.UUID{&member}, membersOf(arrivals.batches[0]))
	assert.Equal(t, []bool{true}, arrivals.afterCommit)
}

func TestSendLetter_BroadcastIsAnnouncedOnceForEveryMember(t *testing.T) {
	svc, arrivals := newSendService(&fakeRepo{}, &fakeItems{})

	_, err := svc.SendLetter(context.Background(), admin, draft(toAll))

	require.NoError(t, err)
	require.Len(t, arrivals.batches, 1)
	assert.Equal(t, []*uuid.UUID{nil}, membersOf(arrivals.batches[0]))
	assert.Equal(t, []bool{true}, arrivals.afterCommit)
}

// A6: [A, B, A, C] stores three letters and announces the three as one batch.
func TestSendLetter_MemberListAnnouncesEachStoredLetterInOneBatchAfterTheCommit(t *testing.T) {
	svc, arrivals := newSendService(&fakeRepo{}, &fakeItems{})
	a, b, c := uuid.New(), uuid.New(), uuid.New()

	_, err := svc.SendLetter(context.Background(), admin, draft(toList(a, b, a, c)))

	require.NoError(t, err)
	require.Len(t, arrivals.batches, 1)
	assert.Equal(t, []*uuid.UUID{&a, &b, &c}, membersOf(arrivals.batches[0]))
	assert.Equal(t, []bool{true}, arrivals.afterCommit)
}

func TestSendLetter_RefusedOrFailedSendAnnouncesNothing(t *testing.T) {
	tmpl := uuid.New()
	cases := []struct {
		name   string
		repo   *fakeRepo
		items  *fakeItems
		caller commonauth.Identity
		draft  LetterDraft
	}{
		{"not an admin", &fakeRepo{}, &fakeItems{}, player, draft(toAll)},
		{"title out of bounds", &fakeRepo{}, &fakeItems{}, admin, LetterDraft{Recipient: toAll, Body: "b"}},
		{"empty member list", &fakeRepo{}, &fakeItems{}, admin, draft(toList())},
		{"unknown template", &fakeRepo{}, &fakeItems{unknownTemplates: map[uuid.UUID]bool{tmpl: true}}, admin, draft(toAll, templateOf(tmpl, 1))},
		{"items down", &fakeRepo{}, &fakeItems{err: ErrItemsUnavailable}, admin, draft(toAll, templateOf(tmpl, 1))},
		{"transaction fails", &fakeRepo{insertErr: errors.New("connection reset")}, &fakeItems{}, admin, draft(toList(uuid.New(), uuid.New()))},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, arrivals := newSendService(tc.repo, tc.items)

			_, err := svc.SendLetter(context.Background(), tc.caller, tc.draft)

			require.Error(t, err)
			assert.Empty(t, arrivals.batches)
		})
	}
}

// A6 with the real publisher: Redis down never fails, undoes or holds up the
// send beyond one deadline, and the failure is logged once.
func TestSendLetter_RedisDownStillStoresEveryLetterAndAnswersWithinOneDeadline(t *testing.T) {
	mr := miniredis.RunT(t)
	addr := mr.Addr()
	mr.Close()
	publisher, logs := publisherOn(t, addr, 200*time.Millisecond)
	repo := &fakeRepo{}
	svc := newTestService(repo, &fakeItems{})
	svc.arrivals = publisher

	start := time.Now()
	got, err := svc.SendLetter(context.Background(), admin, draft(toList(uuid.New(), uuid.New(), uuid.New())))

	require.NoError(t, err)
	assert.Less(t, time.Since(start), time.Second)
	require.Len(t, repo.inserted, 1)
	assert.Len(t, repo.inserted[0], 3)
	assert.Len(t, got.Letters, 3)
	assert.Len(t, logs.warnings(), 1)
}

// The sent-by audit (FS-1GZGD A7.2, R55): the admin send records the token's
// member on every letter it stores, whatever the recipient form, and no
// source.
func TestSendLetter_EveryLetterRecordsTheAdminFromTheToken(t *testing.T) {
	tests := []struct {
		name      string
		recipient Recipient
		letters   int
	}{
		{"one member", toMember(uuid.New()), 1},
		{"a list of three", toList(uuid.New(), uuid.New(), uuid.New()), 3},
		{"all members", toAll, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{}
			_, err := newTestService(repo, &fakeItems{}).SendLetter(context.Background(), admin, draft(tt.recipient))
			require.NoError(t, err)

			require.Len(t, repo.inserted, 1)
			require.Len(t, repo.inserted[0], tt.letters)
			for _, l := range repo.inserted[0] {
				assert.Equal(t, SenderOfficial, l.Sender)
				require.NotNil(t, l.SentBy.MemberID)
				assert.Equal(t, admin.MemberID, *l.SentBy.MemberID)
				assert.Empty(t, l.SentBy.Source)
			}
		})
	}
}

// The seam the system path (I-1GZGD-5's letter request, I-1GZGD-11's welcome)
// stores through: a system letter records its sent-by source and no member.
func TestPrepareLetters_SystemLetterRecordsItsSentBySource(t *testing.T) {
	source, err := ParseSentBySource("test.compensation")
	require.NoError(t, err)

	letters, err := newTestService(&fakeRepo{}, &fakeItems{}).
		prepareLetters(context.Background(), draft(toMember(uuid.New()), gold(100)), systemFrom(source))
	require.NoError(t, err)

	require.Len(t, letters, 1)
	assert.Equal(t, SenderSystem, letters[0].Sender)
	assert.Equal(t, SentBySource("test.compensation"), letters[0].SentBy.Source)
	assert.Nil(t, letters[0].SentBy.MemberID)
}

func TestParseSentBySource_Bounds(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    SentBySource
		wantErr bool
	}{
		{"a service and feature", "marketplace.settlement", "marketplace.settlement", false},
		{"trimmed", "  test.compensation\n", "test.compensation", false},
		{"one character", "x", "x", false},
		{"64 characters", strings.Repeat("a", 64), SentBySource(strings.Repeat("a", 64)), false},
		{"64 characters, not bytes", strings.Repeat("ä", 64), SentBySource(strings.Repeat("ä", 64)), false},
		{"empty", "", "", true},
		{"blank", " \t ", "", true},
		{"65 characters", strings.Repeat("a", 65), "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseSentBySource(tt.raw)
			if tt.wantErr {
				assert.ErrorIs(t, err, ErrSentBySourceInvalid)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}
