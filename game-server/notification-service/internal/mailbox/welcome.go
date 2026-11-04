package mailbox

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

/**
* The welcome letter (FS-1GZGD A7.3, A8; R57-R62): the first letter trigger. When notification
* consumes member.signedup it stores one system letter for the new account, on that event's inbox
* transaction, through the same path as every letter (prepareLetters, InsertLetters).
*
* The potion snapshot is resolved once per process and cached (A8.1). Outcomes:
*   - cache warm: no items call; the whole welcome is stored.
*   - cache cold, items resolves: the snapshot is cached; the whole welcome is stored.
*   - cache cold, items unavailable or out of contract: ErrTransient; nothing stored, the cache
*     stays empty, and the caller's transaction rolls back and is retried.
*   - items refuses the potion (unknown, unrepresentable): logged at error and the welcome is
*     stored with its gold only (A8.2); the refusal is not cached.
**/

// SentBySourceWelcome is the welcome letter's sent-by source (R58).
const SentBySourceWelcome SentBySource = "welcome"

// welcomePotionTemplate is the Small Health Potion (HEALTH_POT_SMALL), seeded by items-service
// migrations/000002_seed_basic_data.up.sql (R59). items has no lookup by name or code.
var welcomePotionTemplate = uuid.MustParse("aa0e8400-e29b-41d4-a716-446655440006")

// The welcome's copy and gift (A7.3). The amounts are the charter's.
const (
	welcomeTitle         = "The Town Keeps a Fire for You"
	welcomePotions int32 = 3
	welcomeGold    int64 = 100

	welcomeBody = "The town keeps a fire for every newcomer, and tonight one burns for you.\n\n" +
		"North of the square the Spire waits, as it has since the town woke to find it there. " +
		"Those who go down come back with relics and plunder, or do not come back at all. " +
		"What you carry out is yours to keep. What you leave behind, the barrow keeps.\n\n" +
		"Go in prepared. Sealed in this letter are three small health potions and a hundred gold, " +
		"enough to buy what the Quartermaster thinks you will need.\n\n" +
		"Take them. They will wait in your stash."
)

// StoreWelcome stores member's welcome letter on tx, the caller's open transaction, and answers
// how to announce it once tx has committed (R62). See the outcomes above: a transient failure
// wraps ErrTransient; a failed insert is a plain error. Neither answers an announce.
func (s *service) StoreWelcome(ctx context.Context, tx *sqlx.Tx, member uuid.UUID) (func(context.Context), error) {
	from := systemFrom(SentBySourceWelcome)
	gift := cachedPotion{cache: &s.welcomeGift, items: s.items}

	letters, err := s.prepareLettersVia(ctx, gift, welcomeDraft(member, true), from)
	var refusal *errcode.Refusal
	switch {
	case errors.As(err, &refusal):
		slog.ErrorContext(ctx, "mailbox: items refused the welcome potion; storing the welcome with its gold only",
			"member_id", member,
			"potion_template_id", welcomePotionTemplate,
			"error", err,
		)
		letters, err = s.prepareLetters(ctx, welcomeDraft(member, false), from)
		if err != nil {
			return nil, fmt.Errorf("prepare the gold-only welcome: %w", err)
		}
	case err != nil:
		return nil, fmt.Errorf("resolve the welcome potion: %w: %w", commonconstants.ErrTransient, err)
	}

	if err := s.repo.InsertLetters(ctx, tx, letters); err != nil {
		return nil, fmt.Errorf("store the welcome letter: %w", err)
	}
	return func(ctx context.Context) { s.arrivals.PublishArrivals(ctx, letters) }, nil
}

// welcomeDraft is the welcome to one member: the potions and the gold, or the gold alone.
func welcomeDraft(member uuid.UUID, withPotions bool) LetterDraft {
	enclosures := make([]EnclosureRequest, 0, 2)
	if withPotions {
		enclosures = append(enclosures, EnclosureRequest{Kind: RequestTemplate, TemplateID: welcomePotionTemplate, Quantity: welcomePotions})
	}
	enclosures = append(enclosures, EnclosureRequest{Kind: RequestGold, Gold: welcomeGold})
	return LetterDraft{
		Recipient:  Recipient{Kind: RecipientMember, MemberIDs: []uuid.UUID{member}},
		Title:      welcomeTitle,
		Body:       welcomeBody,
		Enclosures: enclosures,
	}
}

// potionCache holds the welcome potion's resolution once items has resolved it, for the life of
// the process (A8.1). Zero value is empty. Filled only by a resolution that resolved every id, so
// an outage or a refusal leaves it empty and the next welcome asks again.
type potionCache struct {
	mu       sync.Mutex
	resolved *Resolution
}

func (c *potionCache) load() *Resolution {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.resolved
}

func (c *potionCache) store(res *Resolution) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.resolved = res
}

// cachedPotion is the welcome's resolver: the cache when it holds the potion, items otherwise.
// Only the welcome draft goes through it, so the cached answer is always the one asked for. The
// lock is not held across the items call: concurrent cold-cache welcomes may each resolve, and
// either answer fills the cache.
type cachedPotion struct {
	cache *potionCache
	items snapshotResolver
}

func (c cachedPotion) ResolveItemSnapshots(ctx context.Context, templates []TemplateRef, instanceIDs []uuid.UUID) (*Resolution, error) {
	if res := c.cache.load(); res != nil {
		return res, nil
	}
	res, err := c.items.ResolveItemSnapshots(ctx, templates, instanceIDs)
	if err != nil {
		return nil, err
	}
	if resolvedEvery(res, len(templates), len(instanceIDs)) {
		c.cache.store(res)
	}
	return res, nil
}

// resolvedEvery reports whether res answers a snapshot for every id asked and no reason.
func resolvedEvery(res *Resolution, templates, instances int) bool {
	if len(res.UnknownTemplateIDs)+len(res.UnknownInstanceIDs)+len(res.UnrepresentableIDs) > 0 ||
		len(res.Templates) != templates || len(res.Instances) != instances {
		return false
	}
	for _, snaps := range [][]*ItemSnapshot{res.Templates, res.Instances} {
		for _, snap := range snaps {
			if snap == nil {
				return false
			}
		}
	}
	return true
}
