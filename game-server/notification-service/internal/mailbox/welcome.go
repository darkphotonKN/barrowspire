package mailbox

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
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
* The potion is found by its catalogue name, not a fixed id: the dev seed mints its template, so the
* id differs per environment (A10). Its id and snapshot are found and resolved once per process and
* cached (A8.1). Outcomes:
*   - no template by that name, or no gift configured: logged at error and the welcome is stored
*     with its gold only; a miss is not cached.
*   - cache warm: no items call; the whole welcome is stored.
*   - cache cold, items resolves: the snapshot is cached; the whole welcome is stored.
*   - cache cold, items unavailable or out of contract: ErrTransient; nothing stored, the cache
*     stays empty, and the caller's transaction rolls back and is retried.
*   - items refuses the potion (unknown, unrepresentable): logged at error and the welcome is
*     stored with its gold only (A8.2); the refusal is not cached.
**/

// SentBySourceWelcome is the welcome letter's sent-by source (R58).
const SentBySourceWelcome SentBySource = "welcome"

// DefaultWelcomeGiftName is the catalogue name of the welcome potion when WELCOME_GIFT_TEMPLATE_NAME
// is unset: the dev seed's small healing potion (A10).
const DefaultWelcomeGiftName = "Lesser Heal Potion"

// WelcomeGiftFinder finds a catalogue template by name: ItemsClient in production.
type WelcomeGiftFinder interface {
	FindTemplateByName(ctx context.Context, name string) (id uuid.UUID, found bool, err error)
}

// welcomeGift is where the welcome potion is found. The zero value has none: gold only.
type welcomeGift struct {
	finder WelcomeGiftFinder
	name   string
}

// WithWelcomeGift sets where the welcome potion is found: the template named name in finder's
// catalogue (blank is DefaultWelcomeGiftName). Without it a welcome carries its gold only.
func (s *service) WithWelcomeGift(finder WelcomeGiftFinder, name string) *service {
	name = strings.TrimSpace(name)
	if name == "" {
		name = DefaultWelcomeGiftName
	}
	s.gift = welcomeGift{finder: finder, name: name}
	return s
}

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

	potion, err := s.welcomePotion(ctx, member)
	if err != nil {
		return nil, fmt.Errorf("find the welcome potion: %w: %w", commonconstants.ErrTransient, err)
	}

	letters, err := s.prepareLettersVia(ctx, gift, welcomeDraft(member, potion), from)
	var refusal *errcode.Refusal
	switch {
	case errors.As(err, &refusal):
		slog.ErrorContext(ctx, "mailbox: items refused the welcome potion; storing the welcome with its gold only",
			"member_id", member,
			"potion_template_id", potion,
			"error", err,
		)
		letters, err = s.prepareLetters(ctx, welcomeDraft(member, nil), from)
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

// welcomePotion is the welcome potion's template id: cached, or found by name in the catalogue
// and cached. nil, with no error, is no potion: none configured, or none by that name (logged at
// error; a miss is not cached, so a fixed catalogue is picked up by the next welcome). An error is
// the catalogue unreachable.
func (s *service) welcomePotion(ctx context.Context, member uuid.UUID) (*uuid.UUID, error) {
	if id, ok := s.welcomeGift.loadID(); ok {
		return &id, nil
	}
	if s.gift.finder == nil || s.gift.name == "" {
		slog.ErrorContext(ctx, "mailbox: no welcome gift configured; storing the welcome with its gold only",
			"member_id", member)
		return nil, nil
	}
	id, found, err := s.gift.finder.FindTemplateByName(ctx, s.gift.name)
	if err != nil {
		return nil, err
	}
	if !found {
		slog.ErrorContext(ctx, "mailbox: the welcome potion is not in the catalogue; storing the welcome with its gold only",
			"member_id", member,
			"potion_name", s.gift.name,
		)
		return nil, nil
	}
	s.welcomeGift.storeID(id)
	return &id, nil
}

// welcomeDraft is the welcome to one member: the potions and the gold, or the gold alone when
// potion is nil.
func welcomeDraft(member uuid.UUID, potion *uuid.UUID) LetterDraft {
	enclosures := make([]EnclosureRequest, 0, 2)
	if potion != nil {
		enclosures = append(enclosures, EnclosureRequest{Kind: RequestTemplate, TemplateID: *potion, Quantity: welcomePotions})
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
	id       uuid.UUID
	idKnown  bool
}

func (c *potionCache) loadID() (uuid.UUID, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.id, c.idKnown
}

func (c *potionCache) storeID(id uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.id, c.idKnown = id, true
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
