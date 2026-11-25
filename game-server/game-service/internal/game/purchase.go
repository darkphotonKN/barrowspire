package game

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* Buying from the wandering merchant (FS-9JV5K §B, ADR-0093). A buy is judged
* on the tick: refused at once, or one of the ware reserved and a purchase
* opened with its purchase key. The debit runs on its own goroutine, as the
* buyer, retried with the same key; its answer is applied on a later tick
* through the intent queue: granted on success, the reserve released on
* refusal. Nothing is granted before the debit succeeds, and the tick never
* waits on the wallet.
**/

// WalletDebiter is wallet-service as a run's purchase uses it: take amount
// from the wallet of the member whose bearer token ctx carries outgoing, once
// per key. applied false is a key already debited, success too. A failure
// wraps types.ErrNotEnoughGold, types.ErrNoWallet, types.ErrWalletRefused
// (nothing taken) or types.ErrWalletTransient (the same key may land if
// tried again); anything else is final, and may have committed.
type WalletDebiter interface {
	Debit(ctx context.Context, amount int64, key string) (applied bool, err error)
}

// UseWallet has the run pay its purchases from wallet, each debit on ctx, the
// host's lifetime context, kept without its cancellation: its values carry
// into the call, and a host shutting down does not cut a debit in flight (its
// outcome would be unknown). The host sets it as it builds a run, before the
// run is reachable; without one, every buy is refused wallet_unavailable.
func (s *Session) UseWallet(ctx context.Context, wallet WalletDebiter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.wallet = wallet
	s.walletCtx = context.WithoutCancel(ctx)
}

// The buy replies' refusal reasons, from which the client writes its own
// lines. FS-9JV5K §B R6, R10.
const (
	RefusalNotInPlay         = "not_in_play"
	RefusalOutOfReach        = "out_of_reach"
	RefusalSoldOut           = "sold_out"
	RefusalBagFull           = "bag_full"
	RefusalTomeHeld          = "tome_held"
	RefusalPurchasePending   = "purchase_pending"
	RefusalNotEnoughGold     = "not_enough_gold"
	RefusalNoWallet          = "no_wallet"
	RefusalWalletUnavailable = "wallet_unavailable"
	// RefusalOutcomeUnknown is a debit whose answer never came, or came as a
	// failure after it may have committed: the gold may have been taken
	// (amended 2026-11-25)
	RefusalOutcomeUnknown = "outcome_unknown"
)

// buyRefusalMessages are the plain words beside each reason.
var buyRefusalMessages = map[string]string{
	RefusalNotInPlay:         "you are not in play",
	RefusalOutOfReach:        "too far away",
	RefusalSoldOut:           "sold out",
	RefusalBagFull:           "your bag is full",
	RefusalTomeHeld:          "you already carry a tome",
	RefusalPurchasePending:   "a purchase is already being paid",
	RefusalNotEnoughGold:     "not enough gold",
	RefusalNoWallet:          "your purse can't be reached",
	RefusalWalletUnavailable: "your purse can't be reached",
	RefusalOutcomeUnknown:    "your purse did not answer",
}

// purchaseRetry is how a debit is retried: at most budget in all, waiting
// first after the first transient failure, doubling up to most.
type purchaseRetry struct {
	budget, first, most time.Duration
}

// defaultPurchaseRetry retries for at most 10 s in all (FS-9JV5K §B R9).
var defaultPurchaseRetry = purchaseRetry{budget: 10 * time.Second, first: 250 * time.Millisecond, most: 2 * time.Second}

// purchase is one sale in flight: reserved on the tick, its debit under way.
type purchase struct {
	key   string
	buyer uuid.UUID
	ware  components.WareKind
	price int64
	// item is what a bag ware's sale creates; nil for the tome
	item *types.ItemConfig
	// floor and merchant are where it was reserved: the reserve is released
	// only while that floor still stands (R12)
	floor    int
	merchant uuid.UUID
	// err is the debit's answer, nil when it was paid; set once, before the
	// answer is queued
	err      error
	answered bool
}

/**
* purchaseBook is a run's purchases: each buyer's purchase count, which keys
* the next, and the purchase each buyer has in flight (one at a time). It is
* shared by the tick and the debit goroutines, under its own lock, which is
* never held while taking the world's. Once the run shuts down it is closed:
* a paid purchase no tick will apply is logged for support (R11).
**/
type purchaseBook struct {
	mu       sync.Mutex
	counts   map[uuid.UUID]int
	inFlight map[uuid.UUID]*purchase
	closed   bool
}

func newPurchaseBook() *purchaseBook {
	return &purchaseBook{counts: map[uuid.UUID]int{}, inFlight: map[uuid.UUID]*purchase{}}
}

// pending is whether buyer has a purchase in flight.
func (b *purchaseBook) pending(buyer uuid.UUID) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, ok := b.inFlight[buyer]
	return ok
}

// open records p as its buyer's next purchase in the run and keys it:
// purchase:<run id>:<buyer member id>:<n>, n counted from 1 per buyer and
// never reused (R7, ADR-0009).
func (b *purchaseBook) open(runID uuid.UUID, p *purchase) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.counts[p.buyer]++
	p.key = fmt.Sprintf("purchase:%s:%s:%d", runID, p.buyer, b.counts[p.buyer])
	b.inFlight[p.buyer] = p
}

// answer records the debit's answer and hands queue the purchase to apply,
// unless the run has shut down: then a paid purchase is logged, as nothing
// will grant it.
func (b *purchaseBook) answer(runID uuid.UUID, p *purchase, err error, queue func()) {
	b.mu.Lock()
	defer b.mu.Unlock()
	p.err, p.answered = err, true
	if b.closed {
		warnUnsettled(runID, p)
		return
	}
	queue()
}

// settle takes p out of flight as the tick applies it; false when the run
// shut down first (the shutdown logged it, if paid).
func (b *purchaseBook) settle(p *purchase) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return false
	}
	if b.inFlight[p.buyer] == p {
		delete(b.inFlight, p.buyer)
	}
	return true
}

// close shuts the book with its run: every purchase paid and not yet applied
// is logged, as no tick will apply it.
func (b *purchaseBook) close(runID uuid.UUID) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.closed = true
	for _, p := range b.inFlight {
		if p.answered {
			warnUnsettled(runID, p)
		}
	}
}

// warnUnsettled logs an answered purchase no tick will apply, as the run
// ended, when support may have to make it good: paid, or its outcome unknown.
func warnUnsettled(runID uuid.UUID, p *purchase) {
	switch {
	case p.err == nil:
		warnPaidNotGranted(runID, p, "the run ended")
	case debitRefusal(p.err) == RefusalOutcomeUnknown:
		warnOutcomeUnknown(runID, p)
	}
}

// warnOutcomeUnknown logs a purchase whose debit may or may not have taken
// the gold, with what support needs to check and make it good (R10, amended
// 2026-11-25). The reserve is released as for a refusal.
func warnOutcomeUnknown(runID uuid.UUID, p *purchase) {
	slog.Warn("Purchase outcome unknown",
		"sessionID", runID, "purchase_key", p.key, "buyer", p.buyer, "ware", p.ware, "price", p.price, "error", p.err)
}

// warnPaidNotGranted logs a purchase whose gold was spent and whose ware was
// never granted, with what support needs to make it good (R11, ADR-0093).
func warnPaidNotGranted(runID uuid.UUID, p *purchase, why string) {
	slog.Warn("Purchase paid but not granted",
		"sessionID", runID, "purchase_key", p.key, "buyer", p.buyer, "ware", p.ware, "price", p.price, "why", why)
}

/**
* buy applies a queued buy on the tick (R5-R7). Escape runs only, the buyer
* seated: elsewhere it is ignored, as no world but a run has a merchant. A
* refusal of R6 replies at once, reserves nothing and calls no wallet;
* otherwise one of the ware is reserved and its debit starts off the tick.
**/
func (s *Session) buy(playerID, merchantID uuid.UUID, kind components.WareKind) {
	if s.worldType != types.WorldTypeRun {
		slog.Debug("Refusing buy outside a run", "session_id", s.ID, "player_id", playerID)
		return
	}
	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[playerID]
	wallet, walletCtx := s.wallet, s.walletCtx
	s.mu.RUnlock()
	if !here {
		return
	}
	buyer, ok := s.EntityManager.GetEntity(entityID)
	if !ok {
		return
	}

	ware, refusal := s.judgeBuy(playerID, buyer, merchantID, kind)
	if refusal == "" && wallet == nil {
		slog.Error("Refusing buy: the run has no wallet to pay from", "session_id", s.ID, "player_id", playerID)
		refusal = RefusalWalletUnavailable
	}
	if refusal != "" {
		s.refuseBuy(playerID, refusal)
		return
	}

	floor, _ := systems.CurrentFloor(s.EntityManager.GetAllEntities())
	ware.Left--
	p := &purchase{buyer: playerID, ware: kind, price: ware.Price, item: ware.Item, merchant: merchantID}
	if floor != nil {
		p.floor = floor.Depth
	}
	s.purchases.open(s.ID, p)
	slog.Info("Purchase reserved", "session_id", s.ID, "purchase_key", p.key, "buyer", playerID, "ware", kind, "price", p.price)

	go s.pay(walletCtx, wallet, p, s.tokens.of(playerID), s.purchaseRetry)
}

// judgeBuy is the buy's ware, or the R6 refusal that turns it away.
func (s *Session) judgeBuy(playerID uuid.UUID, buyer *ecs.Entity, merchantID uuid.UUID, kind components.WareKind) (*components.Ware, string) {
	if !systems.InPlay(buyer) {
		return nil, RefusalNotInPlay
	}
	if s.purchases.pending(playerID) {
		return nil, RefusalPurchasePending
	}
	merchant, ok := s.EntityManager.GetEntity(merchantID)
	if !ok || !merchant.HasComponent(ecs.ComponentTypeMerchant) || !s.withinReach(buyer, merchant) {
		// a merchant gone with his floor is out of anyone's reach
		return nil, RefusalOutOfReach
	}
	if !knownWare(kind) {
		// no client sends one but a broken one; sold_out on the wire
		slog.Debug("Refusing buy of an unknown ware", "session_id", s.ID, "player_id", playerID, "ware", kind)
		return nil, RefusalSoldOut
	}
	// a party carrying a tome, or done with it, is told so before stock
	// (R6, amended 2026-11-25)
	if kind == components.WareTomeOfFilth {
		if plan, ok := s.tomePlan(); ok && (plan.Carried || plan.Burned) {
			return nil, RefusalTomeHeld
		}
	}
	mc, _ := merchant.GetComponent(ecs.ComponentTypeMerchant)
	ware := mc.(*components.MerchantComponent).Ware(kind)
	if ware == nil || ware.Left <= 0 {
		return nil, RefusalSoldOut
	}
	// the tome goes in no bag (§E R20)
	if bag, ok := bagOf(buyer); ok && kind != components.WareTomeOfFilth && bagFull(bag) {
		return nil, RefusalBagFull
	}
	return ware, ""
}

// knownWare is whether kind is a ware any merchant sells. FS-9JV5K §A R3.
func knownWare(kind components.WareKind) bool {
	switch kind {
	case components.WareHealthPotion, components.WareAntidote, components.WareTomeOfFilth:
		return true
	}
	return false
}

// withinReach is whether a is in interact range of b.
func (s *Session) withinReach(a, b *ecs.Entity) bool {
	ta, okA := a.GetComponent(ecs.ComponentTypeTransform)
	tb, okB := b.GetComponent(ecs.ComponentTypeTransform)
	if !okA || !okB {
		return false
	}
	at, to := ta.(*components.TransformComponent), tb.(*components.TransformComponent)
	return s.calcWithinDistance(at.X, at.Y, to.X, to.Y)
}

// bagOf is the body's bag.
func bagOf(body *ecs.Entity) (*components.ItemIDListComponent, bool) {
	lc, ok := body.GetComponent(ecs.ComponentTypeItemIDList)
	if !ok {
		return nil, false
	}
	bag, ok := lc.(*components.ItemIDListComponent)
	return bag, ok
}

// refuseBuy replies the buy refusal reason.
func (s *Session) refuseBuy(playerID uuid.UUID, reason string) {
	s.sendRefusalToPlayer(playerID, string(constants.ActionBuy), buyRefusalMessages[reason], reason, nil)
}

/**
* pay debits the purchase as its buyer, off the tick: a transient failure is
* tried again with the same key, backing off, for at most retry.budget in all
* (each call bounded by the wallet client). The answer is queued for the tick.
* parent carries the host's values and no cancellation. The token is never
* logged.
**/
func (s *Session) pay(parent context.Context, wallet WalletDebiter, p *purchase, token types.BearerToken, retry purchaseRetry) {
	ctx, cancel := context.WithTimeout(parent, retry.budget)
	defer cancel()
	ctx = asMember(ctx, token)

	wait := retry.first
	var err error
	for {
		_, err = wallet.Debit(ctx, p.price, p.key)
		if !errors.Is(err, types.ErrWalletTransient) {
			break
		}
		slog.Warn("Purchase debit failed, trying again with the same key", "session_id", s.ID, "purchase_key", p.key, "error", err)
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
		case <-timer.C:
		}
		if ctx.Err() != nil {
			break
		}
		wait = min(wait*2, retry.most)
	}

	s.purchases.answer(s.ID, p, err, func() {
		s.queueIntent(func() { s.settlePurchase(p) })
	})
}

/**
* settlePurchase applies a debit's answer on the tick (R10-R12). Paid: the
* reserve is a sale and the buyer is granted the ware, if still in play; a
* buyer gone is logged, the gold spent. Refused: the reserve is released while
* its floor stands, and the buyer, if still in play, is told why.
**/
func (s *Session) settlePurchase(p *purchase) {
	if !s.purchases.settle(p) {
		return
	}
	buyer, present := s.delverInPlayByMember(p.buyer)

	if p.err == nil {
		if !present {
			warnPaidNotGranted(s.ID, p, "the buyer left")
			return
		}
		s.grantWare(p, buyer)
		slog.Info("Purchase granted", "session_id", s.ID, "purchase_key", p.key, "buyer", p.buyer, "ware", p.ware)
		if err := s.sender.SendMessageToPlayer(p.buyer, types.Message{
			Action:  string(constants.ActionBuy),
			Payload: map[string]interface{}{"success": true, "ware": string(p.ware)},
		}); err != nil {
			slog.Debug("Could not tell the buyer their ware is theirs", "player_id", p.buyer, "error", err)
		}
		return
	}

	s.releaseReserve(p)
	reason := debitRefusal(p.err)
	if reason == RefusalOutcomeUnknown {
		warnOutcomeUnknown(s.ID, p)
	} else {
		slog.Info("Purchase refused", "session_id", s.ID, "purchase_key", p.key, "buyer", p.buyer, "reason", reason, "error", p.err)
	}
	if present {
		s.refuseBuy(p.buyer, reason)
	}
}

/**
* debitRefusal is the reply reason a failed debit stands for. Only a definite
* non-debit says nothing was taken: not enough gold, no wallet, or a call the
* wallet turned away (wallet_unavailable). Retries run out on transient
* failures, and any other failure, may have committed: outcome_unknown
* (FS-9JV5K §B R10, amended 2026-11-25).
**/
func debitRefusal(err error) string {
	switch {
	case errors.Is(err, types.ErrNotEnoughGold):
		return RefusalNotEnoughGold
	case errors.Is(err, types.ErrNoWallet):
		return RefusalNoWallet
	case errors.Is(err, types.ErrWalletRefused):
		return RefusalWalletUnavailable
	default:
		return RefusalOutcomeUnknown
	}
}

// delverInPlayByMember is the body of member, a member id, while they are
// seated and in play.
func (s *Session) delverInPlayByMember(member uuid.UUID) (*ecs.Entity, bool) {
	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[member]
	s.mu.RUnlock()
	if !here {
		return nil, false
	}
	body, ok := s.EntityManager.GetEntity(entityID)
	if !ok || !systems.InPlay(body) {
		return nil, false
	}
	return body, true
}

// releaseReserve puts the reserved ware back in stock, while its floor and
// merchant still stand; after a floor change there is no stock to release.
func (s *Session) releaseReserve(p *purchase) {
	floor, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities())
	if !ok || floor.Depth != p.floor {
		return
	}
	merchant, ok := s.EntityManager.GetEntity(p.merchant)
	if !ok {
		return
	}
	if mc, ok := merchant.GetComponent(ecs.ComponentTypeMerchant); ok {
		if ware := mc.(*components.MerchantComponent).Ware(p.ware); ware != nil {
			ware.Left++
		}
	}
}

/**
* grantWare hands a paid ware to its buyer. The tome sets the plan's carried,
* as taking a found tome does (§E R20). A bag ware is created from its
* template as an unsafe find (FS-18Z5F) on the end of the bag, or, the bag
* filled meanwhile, dropped at the buyer's feet in a drop pile (R10).
**/
func (s *Session) grantWare(p *purchase, buyer *ecs.Entity) {
	if p.ware == components.WareTomeOfFilth {
		if plan, ok := s.tomePlan(); ok {
			plan.Carried = true
		}
		return
	}
	if p.item == nil {
		slog.Error("Paid ware has no item to grant", "session_id", s.ID, "purchase_key", p.key, "ware", p.ware)
		return
	}
	item := CreateItemEntity(s.EntityManager, *p.item)

	s.mu.Lock()
	defer s.mu.Unlock()
	bag, ok := bagOf(buyer)
	if ok && !bagFull(bag) {
		bag.ItemIDs = append(bag.ItemIDs, item.ID)
		return
	}
	tc, _ := buyer.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	CreateDropPileEntity(s.EntityManager, at.X, at.Y, []uuid.UUID{item.ID})
	slog.Info("Paid ware dropped at the buyer's feet: their bag is full", "session_id", s.ID, "purchase_key", p.key)
}

/**
* memberTokens is the latest bearer token of each seated member, the one a
* purchase's debit is made with (R8): taken at seating and replaced on every
* reconnect and renewal. Never on the wire or in logs. Its own lock, a leaf:
* the host sets it holding its own.
**/
type memberTokens struct {
	mu       sync.Mutex
	byMember map[uuid.UUID]types.BearerToken
}

func newMemberTokens() *memberTokens {
	return &memberTokens{byMember: map[uuid.UUID]types.BearerToken{}}
}

// seat holds member's token as they are seated.
func (m *memberTokens) seat(member uuid.UUID, token types.BearerToken) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.byMember[member] = token
}

// replace swaps a seated member's token for token; nobody else's is kept.
func (m *memberTokens) replace(member uuid.UUID, token types.BearerToken) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, seated := m.byMember[member]; seated {
		m.byMember[member] = token
	}
}

// forget drops a member's token as they leave the world.
func (m *memberTokens) forget(member uuid.UUID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.byMember, member)
}

// of is member's latest token, empty with none.
func (m *memberTokens) of(member uuid.UUID) types.BearerToken {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.byMember[member]
}

// holdToken keeps member's token as they are seated, in a run only: only a
// run has a merchant to pay, so the hub and the fields hold no buyer's token.
// FS-9JV5K §B R8.
func (s *Session) holdToken(member uuid.UUID, token types.BearerToken) {
	if s.worldType != types.WorldTypeRun {
		return
	}
	s.tokens.seat(member, token)
}

// KeepToken replaces a seated member's held token with the one they just
// reconnected or renewed with, so their next purchase is made as them with a
// live token (FS-9JV5K §B R8). A member not seated here is ignored.
func (s *Session) KeepToken(member uuid.UUID, token types.BearerToken) {
	s.tokens.replace(member, token)
}
