package game

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

// debitCall is one call the fake wallet took.
type debitCall struct {
	key    string
	amount int64
	auth   []string
}

/**
* fakeWallet is wallet-service's debit as a test drives it: it records every
* call's key, amount and forwarded token, and answers each with answer(n), n
* counted from 0 (nil: paid). With gate set, every call blocks until the gate
* is closed or the call's context ends.
**/
type fakeWallet struct {
	mu     sync.Mutex
	calls  []debitCall
	answer func(n int) error
	gate   chan struct{}
}

func (f *fakeWallet) Debit(ctx context.Context, amount int64, key string) (bool, error) {
	md, _ := metadata.FromOutgoingContext(ctx)
	f.mu.Lock()
	n := len(f.calls)
	f.calls = append(f.calls, debitCall{key: key, amount: amount, auth: md.Get("authorization")})
	f.mu.Unlock()

	if f.gate != nil {
		select {
		case <-f.gate:
		case <-ctx.Done():
			return false, fmt.Errorf("%w: %w", types.ErrWalletTransient, ctx.Err())
		}
	}
	if f.answer != nil {
		if err := f.answer(n); err != nil {
			return false, err
		}
	}
	return true, nil
}

func (f *fakeWallet) taken() []debitCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]debitCall(nil), f.calls...)
}

// shop is a merchant's floor with one delver standing beside him, the floor
// cleared of monsters, a fake wallet and the delver's token held.
type shop struct {
	s        *Session
	sender   *recordingSender
	wallet   *fakeWallet
	buyer    uuid.UUID
	merchant *ecs.Entity
	wares    *components.MerchantComponent
}

const buyerToken = "the-buyers-token"

func newShop(t *testing.T, delvers int) *shop {
	t.Helper()
	return newShopOffering(t, delvers, 0)
}

// newShopOffering is newShop whose merchant offers the tome at tomeChance.
func newShopOffering(t *testing.T, delvers int, tomeChance float64) *shop {
	t.Helper()
	s, ids := merchantRun(t, 6, delvers, 5, tomeChance)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	wallet := &fakeWallet{}
	s.UseWallet(wallet)
	s.purchaseRetry = purchaseRetry{budget: 2 * time.Second, first: time.Millisecond, most: 5 * time.Millisecond}
	merchant, wares := theMerchant(t, s)
	at := transformOf(t, merchant)
	for i, id := range ids {
		s.KeepToken(id, types.BearerToken(fmt.Sprintf("%s-%d", buyerToken, i)))
		body := transformOf(t, delverEntity(t, s, id))
		body.X, body.Y = at.X+float64(10*(i+1)), at.Y
	}
	s.KeepToken(ids[0], buyerToken)
	return &shop{s: s, sender: s.sender.(*recordingSender), wallet: wallet, buyer: ids[0], merchant: merchant, wares: wares}
}

// buyReplies are the buy replies sent to member.
func (sh *shop) buyReplies(member uuid.UUID) []map[string]interface{} {
	var replies []map[string]interface{}
	for _, m := range sh.sender.to(member) {
		if m.Action == string(constants.ActionBuy) {
			replies = append(replies, m.Payload)
		}
	}
	return replies
}

// settleUntil ticks until done holds, failing after a second.
func (sh *shop) settleUntil(t *testing.T, what string, done func() bool) {
	t.Helper()
	require.Eventually(t, func() bool {
		tick(sh.s)
		return done()
	}, 2*time.Second, time.Millisecond, what)
}

// replied ticks until member has n buy replies, and returns the last.
func (sh *shop) replied(t *testing.T, member uuid.UUID, n int) map[string]interface{} {
	t.Helper()
	sh.settleUntil(t, "the buy is answered", func() bool { return len(sh.buyReplies(member)) >= n })
	replies := sh.buyReplies(member)
	return replies[n-1]
}

func (sh *shop) bag(t *testing.T, member uuid.UUID) []uuid.UUID {
	t.Helper()
	bag, ok := bagOf(delverEntity(t, sh.s, member))
	require.True(t, ok)
	return bag.ItemIDs
}

// FS-9JV5K §B R7-R10 (the TDD seed): a buy for a ware with stock reserves it
// on the tick (left drops by one) and calls the debit, as the buyer, with
// purchase:<run>:<member>:1; a later tick grants the potion as an unsafe find
// on the end of the bag and replies { success: true, ware }.
func TestBuy_ReservesDebitsAsTheBuyerAndGrantsOnALaterTick(t *testing.T) {
	sh := newShop(t, 1)
	potion := sh.wares.Ware(components.WareHealthPotion)
	bagBefore := len(sh.bag(t, sh.buyer))

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	assert.Equal(t, MerchantPotionStock-1, potion.Left, "reserved on the tick")

	reply := sh.replied(t, sh.buyer, 1)
	assert.Equal(t, map[string]interface{}{"success": true, "ware": "health_potion"}, reply)
	calls := sh.wallet.taken()
	require.Len(t, calls, 1)
	assert.Equal(t, fmt.Sprintf("purchase:%s:%s:1", sh.s.ID, sh.buyer), calls[0].key)
	assert.Equal(t, MerchantPotionPrice, calls[0].amount)
	assert.Equal(t, []string{"Bearer " + buyerToken}, calls[0].auth)

	bag := sh.bag(t, sh.buyer)
	require.Len(t, bag, bagBefore+1)
	item := itemOf(t, sh.s, bag[len(bag)-1])
	assert.Equal(t, "Lesser Heal Potion", item.Name)
	assert.True(t, item.Unsafe, "a bought ware is an unsafe find")
	assert.Equal(t, MerchantPotionStock-1, potion.Left, "the reserve is a sale")
}

// FS-9JV5K §B R6: each refusal replies at once with its reason, reserves
// nothing and calls no wallet.
func TestBuy_RefusalsAtOnce_NoReserveNoWalletCall(t *testing.T) {
	cases := []struct {
		reason string
		ware   components.WareKind
		set    func(t *testing.T, sh *shop) uuid.UUID // the merchant id bought from
	}{
		{RefusalNotInPlay, components.WareHealthPotion, func(t *testing.T, sh *shop) uuid.UUID {
			healthComponentOf(delverEntity(t, sh.s, sh.buyer)).CurrentHealth = 0
			return sh.merchant.ID
		}},
		{RefusalOutOfReach, components.WareHealthPotion, func(t *testing.T, sh *shop) uuid.UUID {
			transformOf(t, delverEntity(t, sh.s, sh.buyer)).X += 500
			return sh.merchant.ID
		}},
		{RefusalOutOfReach, components.WareHealthPotion, func(*testing.T, *shop) uuid.UUID { return uuid.New() }},
		{RefusalSoldOut, components.WareAntidote, func(_ *testing.T, sh *shop) uuid.UUID {
			sh.wares.Ware(components.WareAntidote).Left = 0
			return sh.merchant.ID
		}},
		{RefusalSoldOut, components.WareTomeOfFilth, func(_ *testing.T, sh *shop) uuid.UUID { return sh.merchant.ID }},
		{RefusalSoldOut, "a_crown", func(_ *testing.T, sh *shop) uuid.UUID { return sh.merchant.ID }},
		{RefusalBagFull, components.WareHealthPotion, func(t *testing.T, sh *shop) uuid.UUID {
			bag, _ := bagOf(delverEntity(t, sh.s, sh.buyer))
			for len(bag.ItemIDs) < BagCapacity {
				bag.ItemIDs = append(bag.ItemIDs, uuid.New())
			}
			return sh.merchant.ID
		}},
		{RefusalTomeHeld, components.WareTomeOfFilth, func(_ *testing.T, sh *shop) uuid.UUID {
			sh.wares.Wares = append(sh.wares.Wares, components.Ware{Kind: components.WareTomeOfFilth, Price: MerchantTomePrice, Left: 1})
			sh.s.setTomePlan(2, 3)
			plan, _ := sh.s.tomePlan()
			plan.Carried = true
			return sh.merchant.ID
		}},
		{RefusalTomeHeld, components.WareTomeOfFilth, func(_ *testing.T, sh *shop) uuid.UUID {
			sh.wares.Wares = append(sh.wares.Wares, components.Ware{Kind: components.WareTomeOfFilth, Price: MerchantTomePrice, Left: 1})
			sh.s.setTomePlan(2, 3)
			plan, _ := sh.s.tomePlan()
			plan.Burned = true
			return sh.merchant.ID
		}},
	}
	for _, tc := range cases {
		t.Run(tc.reason+" "+string(tc.ware), func(t *testing.T) {
			sh := newShop(t, 1)
			merchantID := tc.set(t, sh)
			before := stockOf(sh.wares)

			sh.s.buy(sh.buyer, merchantID, tc.ware)

			replies := sh.buyReplies(sh.buyer)
			require.Len(t, replies, 1, "replied at once, on the same tick")
			assert.Equal(t, false, replies[0]["success"])
			assert.Equal(t, tc.reason, replies[0]["reason"])
			assert.Equal(t, before, stockOf(sh.wares), "nothing reserved")
			ticks(sh.s, 3)
			assert.Empty(t, sh.wallet.taken(), "no wallet call")
		})
	}
}

// stockOf is each ware's left, by kind.
func stockOf(m *components.MerchantComponent) map[components.WareKind]int {
	left := map[components.WareKind]int{}
	for _, w := range m.Wares {
		left[w.Kind] = w.Left
	}
	return left
}

// FS-9JV5K §B R6, Edge States "A buyer clicks Buy twice": a second buy while
// the first is in flight is refused purchase_pending, and the tick never
// blocks on a wallet that does not answer (R7).
func TestBuy_TheTickNeverBlocksOnAStuckWallet(t *testing.T) {
	sh := newShop(t, 1)
	sh.wallet.gate = make(chan struct{})
	potion := sh.wares.Ware(components.WareHealthPotion)

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	require.Eventually(t, func() bool { return len(sh.wallet.taken()) == 1 }, time.Second, time.Millisecond)

	stepped := make(chan struct{})
	go func() {
		ticks(sh.s, 30)
		close(stepped)
	}()
	select {
	case <-stepped:
	case <-time.After(time.Second):
		t.Fatal("the tick waited on the wallet")
	}
	assert.Equal(t, MerchantPotionStock-1, potion.Left, "still reserved")
	assert.Empty(t, sh.buyReplies(sh.buyer), "nothing answered yet")

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareAntidote)
	replies := sh.buyReplies(sh.buyer)
	require.Len(t, replies, 1)
	assert.Equal(t, RefusalPurchasePending, replies[0]["reason"])
	assert.Equal(t, MerchantAntidoteStock, sh.wares.Ware(components.WareAntidote).Left)

	close(sh.wallet.gate)
	assert.Equal(t, true, sh.replied(t, sh.buyer, 2)["success"])
}

// FS-9JV5K §B R9: a transient failure is retried with the same key until the
// debit lands.
func TestBuy_TransientFailureRetriedWithTheSameKey(t *testing.T) {
	sh := newShop(t, 1)
	sh.wallet.answer = func(n int) error {
		if n < 2 {
			return fmt.Errorf("%w: unavailable", types.ErrWalletTransient)
		}
		return nil
	}

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareAntidote)

	assert.Equal(t, map[string]interface{}{"success": true, "ware": "antidote"}, sh.replied(t, sh.buyer, 1))
	calls := sh.wallet.taken()
	require.Len(t, calls, 3)
	for _, c := range calls {
		assert.Equal(t, calls[0].key, c.key, "the key is stable across retries")
	}
	bag := sh.bag(t, sh.buyer)
	assert.Equal(t, types.AntidoteName, itemOf(t, sh.s, bag[len(bag)-1]).Name)
}

// FS-9JV5K §B R9-R10, Edge States "The wallet is down": retries stop once
// the budget is spent; the buyer is told wallet_unavailable and the reserve
// is released.
func TestBuy_WalletDownForTheWholeBudget_WalletUnavailable(t *testing.T) {
	sh := newShop(t, 1)
	sh.s.purchaseRetry = purchaseRetry{budget: 60 * time.Millisecond, first: 5 * time.Millisecond, most: 10 * time.Millisecond}
	sh.wallet.answer = func(int) error { return fmt.Errorf("%w: unavailable", types.ErrWalletTransient) }
	bagBefore := len(sh.bag(t, sh.buyer))
	started := time.Now()

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)

	reply := sh.replied(t, sh.buyer, 1)
	assert.Equal(t, RefusalWalletUnavailable, reply["reason"])
	assert.Less(t, time.Since(started), time.Second, "bounded by the budget")
	calls := sh.wallet.taken()
	assert.Greater(t, len(calls), 1, "retried")
	for _, c := range calls {
		assert.Equal(t, calls[0].key, c.key)
	}
	assert.Equal(t, MerchantPotionStock, sh.wares.Ware(components.WareHealthPotion).Left, "released")
	assert.Len(t, sh.bag(t, sh.buyer), bagBefore, "nothing granted")
}

// The default budget is 10 s in all. FS-9JV5K §B R9.
func TestDefaultPurchaseRetry_TenSecondsInAll(t *testing.T) {
	assert.Equal(t, 10*time.Second, defaultPurchaseRetry.budget)
}

// FS-9JV5K §B R10: a refusal releases the reserve, grants nothing and replies
// the mapped reason; a refusal is not retried.
func TestBuy_RefusalReleasesTheReserveAndRepliesTheReason(t *testing.T) {
	cases := []struct {
		err    error
		reason string
	}{
		{fmt.Errorf("%w: short", types.ErrNotEnoughGold), RefusalNotEnoughGold},
		{fmt.Errorf("%w: none", types.ErrNoWallet), RefusalNoWallet},
		{errors.New("rpc error: code = Unauthenticated"), RefusalWalletUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.reason, func(t *testing.T) {
			sh := newShop(t, 1)
			sh.wallet.answer = func(int) error { return tc.err }
			bagBefore := len(sh.bag(t, sh.buyer))

			sh.s.buy(sh.buyer, sh.merchant.ID, components.WareAntidote)

			reply := sh.replied(t, sh.buyer, 1)
			assert.Equal(t, false, reply["success"])
			assert.Equal(t, tc.reason, reply["reason"])
			assert.Len(t, sh.wallet.taken(), 1, "not retried")
			assert.Equal(t, MerchantAntidoteStock, sh.wares.Ware(components.WareAntidote).Left, "released")
			assert.Len(t, sh.bag(t, sh.buyer), bagBefore)
		})
	}
}

// FS-9JV5K Edge States "Two buyers, one potion left": the first reserves it,
// the second is refused sold_out at once; the first's refusal returns it.
func TestBuy_TwoBuyersOnePotion(t *testing.T) {
	sh := newShop(t, 2)
	other := otherDelver(t, sh)
	sh.wallet.gate = make(chan struct{})
	sh.wallet.answer = func(int) error { return fmt.Errorf("%w: short", types.ErrNotEnoughGold) }
	potion := sh.wares.Ware(components.WareHealthPotion)
	potion.Left = 1

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	sh.s.buy(other, sh.merchant.ID, components.WareHealthPotion)
	assert.Equal(t, RefusalSoldOut, sh.buyReplies(other)[0]["reason"])

	close(sh.wallet.gate)
	assert.Equal(t, RefusalNotEnoughGold, sh.replied(t, sh.buyer, 1)["reason"])
	assert.Equal(t, 1, potion.Left, "the potion returns to stock")
}

// otherDelver is the shop's second delver.
func otherDelver(t *testing.T, sh *shop) uuid.UUID {
	t.Helper()
	for id := range sh.s.playerIDToEntitiesID {
		if id != sh.buyer {
			return id
		}
	}
	t.Fatal("the shop has one delver")
	return uuid.Nil
}

// FS-9JV5K §B R7, ADR-0009: the purchase key is unique per buyer purchase:
// a buyer's next purchase is :2, another buyer's first is their own :1.
func TestBuy_PurchaseKeyUniquePerBuyerPurchase(t *testing.T) {
	sh := newShop(t, 2)
	other := otherDelver(t, sh)

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	sh.replied(t, sh.buyer, 1)
	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	sh.replied(t, sh.buyer, 2)
	sh.s.buy(other, sh.merchant.ID, components.WareAntidote)
	sh.replied(t, other, 1)

	calls := sh.wallet.taken()
	require.Len(t, calls, 3)
	assert.Equal(t, fmt.Sprintf("purchase:%s:%s:1", sh.s.ID, sh.buyer), calls[0].key)
	assert.Equal(t, fmt.Sprintf("purchase:%s:%s:2", sh.s.ID, sh.buyer), calls[1].key)
	assert.Equal(t, fmt.Sprintf("purchase:%s:%s:1", sh.s.ID, other), calls[2].key)
	assert.Equal(t, []string{fmt.Sprintf("Bearer %s-1", buyerToken)}, calls[2].auth, "each as their own buyer")
}

// FS-9JV5K §B R10: a bag that filled while paying gets the ware dropped at
// the buyer's feet in a drop pile.
func TestBuy_BagFilledWhilePaying_DroppedAtTheFeet(t *testing.T) {
	sh := newShop(t, 1)
	sh.wallet.gate = make(chan struct{})
	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	body := delverEntity(t, sh.s, sh.buyer)
	bag, _ := bagOf(body)
	for len(bag.ItemIDs) < BagCapacity {
		bag.ItemIDs = append(bag.ItemIDs, uuid.New())
	}
	piles := len(entityIDsWith(sh.s, ecs.ComponentTypeContainer))

	close(sh.wallet.gate)
	assert.Equal(t, true, sh.replied(t, sh.buyer, 1)["success"])

	assert.Len(t, bag.ItemIDs, BagCapacity)
	require.Len(t, entityIDsWith(sh.s, ecs.ComponentTypeContainer), piles+1)
	pile, held := dropPileHolding(t, sh.s, body)
	require.Len(t, held, 1)
	assert.Equal(t, "Lesser Heal Potion", itemOf(t, sh.s, held[0]).Name)
	assert.Equal(t, transformOf(t, body).X, transformOf(t, pile).X, "at the buyer's feet")
}

// dropPileHolding is the drop pile at body's feet and what it holds.
func dropPileHolding(t *testing.T, s *Session, body *ecs.Entity) (*ecs.Entity, []uuid.UUID) {
	t.Helper()
	at := transformOf(t, body)
	for _, e := range s.EntityManager.GetAllEntities() {
		cc, ok := e.GetComponent(ecs.ComponentTypeContainer)
		if !ok || cc.(*components.ContainerComponent).Kind != components.ContainerKindDropPile {
			continue
		}
		if p := transformOf(t, e); p.X == at.X && p.Y == at.Y {
			lc, _ := e.GetComponent(ecs.ComponentTypeItemIDList)
			return e, lc.(*components.ItemIDListComponent).ItemIDs
		}
	}
	t.Fatal("no drop pile at the buyer's feet")
	return nil, nil
}

// logBuffer is a log sink safe to write from the debit goroutines.
type logBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (l *logBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.Write(p)
}

func (l *logBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.String()
}

func captureWarnings(t *testing.T) *logBuffer {
	t.Helper()
	logs := &logBuffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return logs
}

// FS-9JV5K §B R11: a buyer who died while paying is granted nothing, sent
// nothing, and the spent purchase is logged at warn with its key, buyer,
// ware and price.
func TestBuy_BuyerGoneAtGrant_LoggedNothingGranted(t *testing.T) {
	logs := captureWarnings(t)
	sh := newShop(t, 1)
	sh.wallet.gate = make(chan struct{})
	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
	bagBefore := len(sh.bag(t, sh.buyer))
	healthComponentOf(delverEntity(t, sh.s, sh.buyer)).CurrentHealth = 0
	key := fmt.Sprintf("purchase:%s:%s:1", sh.s.ID, sh.buyer)

	close(sh.wallet.gate)
	sh.settleUntil(t, "the gone buyer's purchase is logged", func() bool {
		return bytes.Contains([]byte(logs.String()), []byte("Purchase paid but not granted"))
	})

	line := logs.String()
	assert.Contains(t, line, "purchase_key="+key)
	assert.Contains(t, line, "buyer="+sh.buyer.String())
	assert.Contains(t, line, "ware=health_potion")
	assert.Contains(t, line, "price=60")
	assert.NotContains(t, line, buyerToken, "the token is never logged")
	assert.Empty(t, sh.buyReplies(sh.buyer), "no reply to a buyer who is gone")
	assert.Len(t, sh.bag(t, sh.buyer), bagBefore, "nothing granted")
}

// FS-9JV5K §B R11: a run that ends before a paid purchase is applied logs it.
func TestBuy_RunEndsBeforeTheGrant_Logged(t *testing.T) {
	logs := captureWarnings(t)
	sh := newShop(t, 1)
	sh.s.isRunning = true // as a started world is, so Shutdown closes it
	sh.wallet.gate = make(chan struct{})
	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareAntidote)

	sh.s.Shutdown()
	close(sh.wallet.gate)

	require.Eventually(t, func() bool {
		return bytes.Contains([]byte(logs.String()), []byte("Purchase paid but not granted"))
	}, time.Second, time.Millisecond)
	assert.Contains(t, logs.String(), "purchase_key=purchase:"+sh.s.ID.String())
}

// FS-9JV5K §B R12: after a floor change a paid bag ware is still granted on
// the new floor; a refusal releases nothing, the new merchant's stock is his
// own.
func TestBuy_FloorChangeBeforeTheResult(t *testing.T) {
	t.Run("paid: granted on the new floor", func(t *testing.T) {
		sh := newShop(t, 1)
		sh.wallet.gate = make(chan struct{})
		sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
		require.NoError(t, sh.s.regenerateFloor())
		bagBefore := len(sh.bag(t, sh.buyer))

		close(sh.wallet.gate)
		assert.Equal(t, true, sh.replied(t, sh.buyer, 1)["success"])
		assert.Len(t, sh.bag(t, sh.buyer), bagBefore+1)
	})
	t.Run("refused: nothing released", func(t *testing.T) {
		sh := newShop(t, 1)
		sh.wallet.gate = make(chan struct{})
		sh.wallet.answer = func(int) error { return fmt.Errorf("%w: short", types.ErrNotEnoughGold) }
		sh.s.buy(sh.buyer, sh.merchant.ID, components.WareHealthPotion)
		require.NoError(t, sh.s.regenerateFloor())
		_, next := theMerchant(t, sh.s)

		close(sh.wallet.gate)
		assert.Equal(t, RefusalNotEnoughGold, sh.replied(t, sh.buyer, 1)["reason"])
		assert.Equal(t, MerchantPotionStock, next.Ware(components.WareHealthPotion).Left)
	})
}

// FS-9JV5K §B R8: the token held is replaced on reconnect; a member never
// seated has none kept.
func TestKeepToken_ReplacesASeatedMembersToken(t *testing.T) {
	sh := newShop(t, 1)
	sh.s.KeepToken(sh.buyer, "renewed")
	stranger := uuid.New()
	sh.s.KeepToken(stranger, "theirs")

	assert.Equal(t, types.BearerToken("renewed"), sh.s.tokens.of(sh.buyer))
	assert.Equal(t, types.BearerToken(""), sh.s.tokens.of(stranger))

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareAntidote)
	sh.replied(t, sh.buyer, 1)
	assert.Equal(t, []string{"Bearer renewed"}, sh.wallet.taken()[0].auth)
}

// A buy routed through the message goroutine is parsed and applied on the
// tick. FS-9JV5K §B R5.
func TestBuy_RoutedAsARunAction(t *testing.T) {
	sh := newShop(t, 1)
	sh.s.MessageCh <- types.ClientPackage{PlayerID: sh.buyer, Message: types.Message{
		Action:  string(constants.ActionBuy),
		Payload: map[string]interface{}{"merchant_id": sh.merchant.ID.String(), "ware": "antidote"},
	}}
	go sh.s.manageClientMessages()
	t.Cleanup(func() { close(sh.s.stopChan) })

	assert.Equal(t, map[string]interface{}{"success": true, "ware": "antidote"}, sh.replied(t, sh.buyer, 1))
}
