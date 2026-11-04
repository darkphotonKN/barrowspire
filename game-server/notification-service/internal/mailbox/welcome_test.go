package mailbox

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The welcome letter (FS-1GZGD A7.3, A8, R57-R62): one system letter per new account, built
// through the send path, its potion snapshot cached for the life of the process once items has
// resolved it, and stored with its gold only when items refuses the potion.

const wantWelcomeBody = "The town keeps a fire for every newcomer, and tonight one burns for you.\n\n" +
	"North of the square the Spire waits, as it has since the town woke to find it there. Those " +
	"who go down come back with relics and plunder, or do not come back at all. What you carry " +
	"out is yours to keep. What you leave behind, the barrow keeps.\n\n" +
	"Go in prepared. Sealed in this letter are three small health potions and a hundred gold, " +
	"enough to buy what the Quartermaster thinks you will need.\n\n" +
	"Take them. They will wait in your stash."

// smallHealthPotion is the id the test catalogue gives the welcome potion's name.
var smallHealthPotion = uuid.MustParse("aa0e8400-e29b-41d4-a716-446655440006")

const testGiftName = "Lesser Heal Potion"

// fakeGifts is the catalogue lookup: names to template ids, or an error.
type fakeGifts struct {
	mu    sync.Mutex
	ids   map[string]uuid.UUID
	err   error
	calls int
	asked []string
}

func newFakeGifts() *fakeGifts {
	return &fakeGifts{ids: map[string]uuid.UUID{testGiftName: smallHealthPotion}}
}

func (f *fakeGifts) FindTemplateByName(_ context.Context, name string) (uuid.UUID, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.asked = append(f.asked, name)
	if f.err != nil {
		return uuid.Nil, false, f.err
	}
	id, ok := f.ids[name]
	return id, ok, nil
}

func storeWelcome(t *testing.T, svc *service, member uuid.UUID) (func(context.Context), error) {
	t.Helper()
	return svc.StoreWelcome(context.Background(), nil, member)
}

func TestStoreWelcome_ColdCache_ResolvesThePotionAndStoresTheWholeWelcome(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	member := uuid.New()

	announce, err := storeWelcome(t, svc, member)

	require.NoError(t, err)
	require.NotNil(t, announce)
	assert.Equal(t, 1, items.calls)
	assert.Equal(t, []TemplateRef{{TemplateID: smallHealthPotion}}, items.templates, "the template's min_item_level: no level asked")
	assert.Empty(t, items.instances)

	require.Len(t, repo.inserted, 1)
	require.Len(t, repo.inserted[0], 1)
	got := repo.inserted[0][0]
	assert.Equal(t, "The Town Keeps a Fire for You", got.Title)
	assert.Equal(t, wantWelcomeBody, got.Body)
	assert.Equal(t, SenderSystem, got.Sender)
	assert.Equal(t, SentBy{Source: SentBySourceWelcome}, got.SentBy)
	assert.Equal(t, SentBySource("welcome"), SentBySourceWelcome)
	require.NotNil(t, got.MemberID)
	assert.Equal(t, member, *got.MemberID)
	assert.Equal(t, now, got.SentAt)
	assert.Equal(t, now.Add(defaultLetterExpiry), got.ExpiresAt)
	require.Len(t, got.Enclosures, 2)
	assert.Equal(t, EnclosureItem, got.Enclosures[0].Kind)
	assert.Equal(t, int32(3), got.Enclosures[0].Quantity)
	require.NotNil(t, got.Enclosures[0].Item)
	assert.Equal(t, smallHealthPotion, got.Enclosures[0].Item.TemplateID)
	assert.Equal(t, Enclosure{Kind: EnclosureGold, Gold: 100}, got.Enclosures[1])
}

func TestStoreWelcome_AnnounceAfterCommit_PublishesTheStoredLetter(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	arrivals := &fakeArrivals{}
	svc.arrivals = arrivals

	announce, err := storeWelcome(t, svc, uuid.New())
	require.NoError(t, err)
	assert.Empty(t, arrivals.batches, "nothing is announced while the caller's transaction is open")

	announce(context.Background())

	require.Len(t, arrivals.batches, 1)
	assert.Equal(t, repo.inserted[0], arrivals.batches[0])
}

func TestStoreWelcome_WarmCache_CallsNoItemsRPC(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	first, second := uuid.New(), uuid.New()

	_, err := storeWelcome(t, svc, first)
	require.NoError(t, err)
	_, err = storeWelcome(t, svc, second)
	require.NoError(t, err)

	assert.Equal(t, 1, items.calls, "the second welcome uses the cached snapshot")
	require.Len(t, repo.inserted, 2)
	assert.Equal(t, second, *repo.inserted[1][0].MemberID)
	assert.Equal(t, repo.inserted[0][0].Enclosures, repo.inserted[1][0].Enclosures)
}

func TestStoreWelcome_ItemsUnavailable_IsTransientStoresNothingAndLeavesTheCacheEmpty(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{err: ErrItemsUnavailable}
	svc := newTestService(repo, items)

	announce, err := storeWelcome(t, svc, uuid.New())

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Nil(t, announce)
	assert.Empty(t, repo.inserted)

	items.err = nil
	_, err = storeWelcome(t, svc, uuid.New())
	require.NoError(t, err)
	assert.Equal(t, 2, items.calls, "the failed resolve did not fill the cache")
	require.Len(t, repo.inserted, 1)
	assert.Len(t, repo.inserted[0][0].Enclosures, 2)
}

func TestStoreWelcome_OutOfContractAnswer_IsTransient(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{err: errors.New("resolve item snapshots: rpc error: code = Internal")}
	svc := newTestService(repo, items)

	_, err := storeWelcome(t, svc, uuid.New())

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Empty(t, repo.inserted)
}

func TestStoreWelcome_PotionRefused_StoresAGoldOnlyWelcomeAndCachesNothing(t *testing.T) {
	tests := []struct {
		name  string
		items *fakeItems
	}{
		{"unknown template", &fakeItems{unknownTemplates: map[uuid.UUID]bool{smallHealthPotion: true}}},
		{"unrepresentable template", &fakeItems{unrepresentable: map[uuid.UUID]bool{smallHealthPotion: true}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			repo := &fakeRepo{}
			svc := newTestService(repo, tt.items)
			member := uuid.New()

			announce, err := storeWelcome(t, svc, member)

			require.NoError(t, err, "a refused potion never breaks signup")
			require.NotNil(t, announce)
			require.Len(t, repo.inserted, 1)
			got := repo.inserted[0][0]
			assert.Equal(t, []Enclosure{{Kind: EnclosureGold, Gold: 100}}, got.Enclosures)
			assert.Equal(t, SentBy{Source: SentBySourceWelcome}, got.SentBy)
			assert.Equal(t, wantWelcomeBody, got.Body)
			assert.Contains(t, logs.String(), "level=ERROR")
			assert.Contains(t, logs.String(), member.String())

			_, err = storeWelcome(t, svc, uuid.New())
			require.NoError(t, err)
			assert.Equal(t, 2, tt.items.calls, "the refusal was not cached")
		})
	}
}

func TestStoreWelcome_PotionRefusedThenFixed_CachesTheFixedSnapshot(t *testing.T) {
	repo := &fakeRepo{}
	items := &fakeItems{unknownTemplates: map[uuid.UUID]bool{smallHealthPotion: true}}
	svc := newTestService(repo, items)

	_, err := storeWelcome(t, svc, uuid.New())
	require.NoError(t, err)
	items.unknownTemplates = nil
	for range 2 {
		_, err = storeWelcome(t, svc, uuid.New())
		require.NoError(t, err)
	}

	assert.Equal(t, 2, items.calls, "resolved once after the fix, then cached")
	require.Len(t, repo.inserted, 3)
	assert.Len(t, repo.inserted[1][0].Enclosures, 2)
	assert.Len(t, repo.inserted[2][0].Enclosures, 2)
}

func TestStoreWelcome_InsertFails_ReturnsTheErrorAndAnnouncesNothing(t *testing.T) {
	repo, items := &fakeRepo{insertErr: errors.New("insert 1 letters: boom")}, &fakeItems{}
	svc := newTestService(repo, items)

	announce, err := storeWelcome(t, svc, uuid.New())

	require.Error(t, err)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient)
	assert.Nil(t, announce)
}

// syncItems and syncRepo serialise the plain fakes so concurrent welcomes can share them; the
// service's own cache gets no such help.
type syncItems struct {
	mu    sync.Mutex
	inner *fakeItems
}

func (s *syncItems) ResolveItemSnapshots(ctx context.Context, templates []TemplateRef, instances []uuid.UUID) (*Resolution, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inner.ResolveItemSnapshots(ctx, templates, instances)
}

func (s *syncItems) GrantItems(ctx context.Context, grantID string, lines []ItemGrant) (*Grant, error) {
	return s.inner.GrantItems(ctx, grantID, lines)
}

type syncRepo struct {
	*fakeRepo
	mu sync.Mutex
}

func (s *syncRepo) InsertLetters(ctx context.Context, tx sqlx.ExtContext, letters []Letter) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.fakeRepo.InsertLetters(ctx, tx, letters)
}

func TestStoreWelcome_ConcurrentColdCache_EveryWelcomeIsWhole(t *testing.T) {
	inner := &fakeItems{}
	repo := &syncRepo{fakeRepo: &fakeRepo{}}
	svc := newTestService(repo.fakeRepo, inner)
	svc.repo = repo
	svc.items = &syncItems{inner: inner}

	const signups = 16
	var wg sync.WaitGroup
	errs := make([]error, signups)
	for i := range signups {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = svc.StoreWelcome(context.Background(), nil, uuid.New())
		}()
	}
	wg.Wait()

	for _, err := range errs {
		require.NoError(t, err)
	}
	require.Len(t, repo.inserted, signups)
	for _, batch := range repo.inserted {
		require.Len(t, batch[0].Enclosures, 2)
		require.NotNil(t, batch[0].Enclosures[0].Item)
		assert.Equal(t, smallHealthPotion, batch[0].Enclosures[0].Item.TemplateID)
	}
	assert.GreaterOrEqual(t, inner.calls, 1)

	// once settled, the cache answers alone
	before := inner.calls
	_, err := svc.StoreWelcome(context.Background(), nil, uuid.New())
	require.NoError(t, err)
	assert.Equal(t, before, inner.calls)
}

func TestWelcomeCopy_PassesTheLetterRules(t *testing.T) {
	title, body, err := checkText(welcomeTitle, welcomeBody)

	require.NoError(t, err)
	assert.Equal(t, welcomeTitle, title)
	assert.Equal(t, welcomeBody, body)
	assert.False(t, strings.Contains(welcomeBody, "\n\n\n"))
}

func TestStoreWelcome_FindsThePotionByName_OncePerProcess(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	gifts := newFakeGifts()
	svc.gift = welcomeGift{finder: gifts, name: testGiftName}

	for range 3 {
		_, err := storeWelcome(t, svc, uuid.New())
		require.NoError(t, err)
	}

	assert.Equal(t, 1, gifts.calls, "the potion's id is looked up once, then cached")
	assert.Equal(t, []string{testGiftName}, gifts.asked)
	for _, batch := range repo.inserted {
		require.Len(t, batch[0].Enclosures, 2)
		assert.Equal(t, smallHealthPotion, batch[0].Enclosures[0].Item.TemplateID)
	}
}

func TestStoreWelcome_PotionNameNotInTheCatalogue_StoresAGoldOnlyWelcomeAndAsksAgainNextTime(t *testing.T) {
	logs := captureLogs(t)
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	gifts := &fakeGifts{ids: map[string]uuid.UUID{}}
	svc.gift = welcomeGift{finder: gifts, name: testGiftName}

	announce, err := storeWelcome(t, svc, uuid.New())

	require.NoError(t, err, "a missing potion never breaks signup")
	require.NotNil(t, announce)
	require.Len(t, repo.inserted, 1)
	assert.Equal(t, []Enclosure{{Kind: EnclosureGold, Gold: 100}}, repo.inserted[0][0].Enclosures)
	assert.Equal(t, 0, items.calls, "nothing to resolve without a template")
	assert.Contains(t, logs.String(), "level=ERROR")
	assert.Contains(t, logs.String(), testGiftName)

	gifts.ids[testGiftName] = smallHealthPotion
	_, err = storeWelcome(t, svc, uuid.New())
	require.NoError(t, err)
	assert.Equal(t, 2, gifts.calls, "a miss is not cached")
	assert.Len(t, repo.inserted[1][0].Enclosures, 2)
}

func TestStoreWelcome_PotionLookupUnavailable_IsTransientAndStoresNothing(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	gifts := &fakeGifts{err: ErrItemsUnavailable}
	svc.gift = welcomeGift{finder: gifts, name: testGiftName}

	announce, err := storeWelcome(t, svc, uuid.New())

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Nil(t, announce)
	assert.Empty(t, repo.inserted)
}

func TestStoreWelcome_NoGiftConfigured_StoresGoldOnly(t *testing.T) {
	repo, items := &fakeRepo{}, &fakeItems{}
	svc := newTestService(repo, items)
	svc.gift = welcomeGift{}

	_, err := storeWelcome(t, svc, uuid.New())

	require.NoError(t, err)
	require.Len(t, repo.inserted, 1)
	assert.Equal(t, []Enclosure{{Kind: EnclosureGold, Gold: 100}}, repo.inserted[0][0].Enclosures)
}
