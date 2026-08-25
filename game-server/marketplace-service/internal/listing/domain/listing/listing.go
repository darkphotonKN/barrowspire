package listing

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// --- Errors ---
var (
	ErrInvalidUUID            = errors.New("invalid uuid")
	ErrInvalidListingState    = errors.New("Invalid state")
	ErrInvalidEndTime         = errors.New("Invalid endtime")
	ErrInvalidStartPrice      = errors.New("Invalid start price")
	ErrInvalidSoldPrice       = errors.New("Invalid sold price")
	ErrInvalidSoldTime        = errors.New("invalid sold time")
	ErrCorruptListingState    = errors.New("corrupt listing state")
	ErrConcurrentModification = errors.New("concurrent modification")

	ErrListingNotAcceptingBids = errors.New("listing not accepting bids")
	ErrListingExpired          = errors.New("listing expired")
	ErrBidTooLow               = errors.New("bid too low")
	ErrBidNotFound             = errors.New("bid not found")
	ErrNotBidOwner             = errors.New("not bid owner")
)

type ListingStatus string

const (
	StatusDraft    ListingStatus = "DRAFT"
	StatusActive   ListingStatus = "ACTIVE"
	StatusWithdraw ListingStatus = "WITHDRAW"
	StatusSold     ListingStatus = "SOLD"
)

type Listing struct {
	id         uuid.UUID
	sellerID   uuid.UUID
	buyerID    *uuid.UUID
	itemID     uuid.UUID
	startPrice int
	soldPrice  *int
	status     ListingStatus
	endsAt     time.Time
	createdAt  time.Time
	updatedAt  time.Time
	bids       []*Bid

	// version
	// used for optimistic locking, important in all roots of DDD hexagonal
	// architecture for preventing check, modify, then act races.
	// retries will be costly due to a host of wasted work if there is high
	// contention on a single resource as every time a race is caught with this
	// version a retry is needed, and causes a retry storm. Prevent with
	// standard race prevention mechanisms like row lock or isolation: serializable
	// based on the situation
	version int
}

// snapshot exposes fields for external use, with no path to write fields
type ListingSnapshot struct {
	ID         uuid.UUID
	SellerID   uuid.UUID
	BuyerID    *uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	SoldPrice  *int
	Status     ListingStatus
	EndsAt     time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Version    int
	Bids       []BidSnapshot
}

func NewListing(sellerID, itemID uuid.UUID, startPrice int, now, endsAt time.Time) (*Listing, error) {
	if sellerID == uuid.Nil {
		return nil, ErrInvalidUUID
	}
	if itemID == uuid.Nil {
		return nil, ErrInvalidUUID
	}
	if !endsAt.After(now) {
		return nil, ErrInvalidEndTime
	}
	if startPrice <= 0 {
		return nil, ErrInvalidStartPrice
	}

	return &Listing{
		id:         uuid.New(),
		sellerID:   sellerID,
		buyerID:    nil,
		itemID:     itemID,
		startPrice: startPrice,
		soldPrice:  nil,
		status:     StatusDraft,
		endsAt:     endsAt,
		createdAt:  now,
		updatedAt:  now,
		version:    0, // births with 0, all aggregate roots start with 0
	}, nil
}

func (l *Listing) Snapshot() ListingSnapshot {
	// copy field by field, not the slice — sharing the *Bid pointers would give
	// callers a write path back into the aggregate
	bids := make([]BidSnapshot, 0, len(l.bids))

	for _, bid := range l.bids {
		bids = append(bids, BidSnapshot{
			ID:             bid.id,
			ListingID:      bid.listingID,
			MemberID:       bid.memberID,
			Type:           bid.bidType,
			Amount:         bid.amount,
			Status:         bid.status,
			IdempotencyKey: bid.idempotencyKey,
			CreatedAt:      bid.createdAt,
			UpdatedAt:      bid.updatedAt,
		})
	}

	// buyerID and soldPrice are the only nilable fields, so they are the only ones
	// that would otherwise hand back a live pointer into the aggregate. Copy the
	// pointee and point at the copy — nil stays nil, so "not settled yet" still
	// reads the same to callers and to sqlx.
	var buyerID *uuid.UUID
	if l.buyerID != nil {
		v := *l.buyerID
		buyerID = &v
	}

	var soldPrice *int
	if l.soldPrice != nil {
		v := *l.soldPrice
		soldPrice = &v
	}

	return ListingSnapshot{
		ID:         l.id,
		SellerID:   l.sellerID,
		BuyerID:    buyerID,
		ItemID:     l.itemID,
		StartPrice: l.startPrice,
		SoldPrice:  soldPrice,
		Status:     l.status,
		EndsAt:     l.endsAt,
		Version:    l.version,
		CreatedAt:  l.createdAt,
		UpdatedAt:  l.updatedAt,
		Bids:       bids,
	}
}

func (l *Listing) Publish(now time.Time) error {
	if l.status != StatusDraft {
		return ErrInvalidListingState
	}
	l.status = StatusActive
	l.updatedAt = now

	return nil
}

func (l *Listing) Withdraw(now time.Time) error {
	if l.status != StatusActive {
		return ErrInvalidListingState
	}
	l.status = StatusWithdraw
	l.updatedAt = now

	return nil
}

func (l *Listing) MarkSold(now time.Time, buyerID uuid.UUID, soldPrice int) error {
	if l.status != StatusActive {
		return ErrInvalidListingState
	}
	if buyerID == uuid.Nil {
		return ErrInvalidUUID
	}
	if soldPrice <= 0 || soldPrice < l.startPrice {
		return ErrInvalidSoldPrice
	}
	if l.endsAt.After(now) {
		return ErrInvalidSoldTime
	}
	l.buyerID = &buyerID
	l.soldPrice = &soldPrice
	l.status = StatusSold
	l.updatedAt = now
	return nil
}

// PlaceBid records a bid under a freshly minted id. Callers that must know the
// id before the bid exists — because another service keys work by it — use
// PlaceBidWithID instead.
func (l *Listing) PlaceBid(memberID uuid.UUID, amount int, idempotencyKey uuid.UUID, now time.Time) error {
	return l.PlaceBidWithID(uuid.New(), memberID, amount, idempotencyKey, now)
}

// PlaceBidWithID records a bid under an id chosen by the caller.
//
// The id is an input because a bid is agreed with wallet-service before it is
// written here: the gold is held against this id, so it has to exist before the
// bid does. Supplying it also makes the write replay-safe — a retry reuses the
// same id and is recognised rather than duplicated.
func (l *Listing) PlaceBidWithID(bidID uuid.UUID, memberID uuid.UUID, amount int, idempotencyKey uuid.UUID, now time.Time) error {
	// A retry after a partially applied write must not create a second bid.
	if l.findBidByID(bidID) != nil {
		return nil
	}

	if l.status != StatusActive {
		return ErrListingNotAcceptingBids
	}

	if !l.endsAt.After(now) {
		return ErrListingExpired
	}

	// A replayed request must not become a second bid. Retries and broker
	// redelivery both resend the same placement, and without this the member
	// ends up outbidding themselves.
	if idempotencyKey != uuid.Nil && l.findBidByIdempotencyKey(idempotencyKey) != nil {
		return nil
	}

	// Compare against whoever is contending, not just the confirmed leader: a
	// PENDING bid is not in idx_bids_single_winner, so two of them can coexist,
	// and both would otherwise clear the bar against the same stale leader.
	contender := l.findContendingBid()

	if contender == nil && amount < l.startPrice {
		return ErrBidTooLow
	}

	if contender != nil && amount <= contender.amount {
		return ErrBidTooLow
	}

	newBid, err := newBid(bidID, l.id, memberID, BidTypeBid, amount, idempotencyKey, now)
	if err != nil {
		return err
	}

	// The incumbent is deliberately left alone. This bid holds no gold yet, so
	// demoting the current leader now would cost the listing its rightful winner
	// if the hold then fails. Demotion happens in ConfirmBid.
	l.bids = append(l.bids, newBid)
	l.updatedAt = now

	return nil
}

// HasBid reports whether this listing carries the given bid. Callers that mint a
// bid id up front use it to tell a recorded bid from one that was deduplicated
// away as a replay.
func (l *Listing) HasBid(bidID uuid.UUID) bool {
	return l.findBidByID(bidID) != nil
}

// ConfirmBid promotes a bid once wallet reports its hold is in place, demoting
// whoever was leading. This is the step that must not simply fail: the bidder's
// gold is already frozen, so a bid left in PENDING is money held against a bid
// that never leads.
func (l *Listing) ConfirmBid(bidID uuid.UUID, now time.Time) error {
	bid := l.findBidByID(bidID)

	if bid == nil {
		return ErrBidNotFound
	}

	// Hold-confirmation events arrive at-least-once, so a redelivery is expected
	// traffic rather than an error — reporting one would make the saga compensate
	// a step that actually succeeded.
	if bid.status == BidStatusWinning {
		return nil
	}

	incumbent := l.findWinningBid()

	if err := bid.transitionTo(BidStatusWinning, now); err != nil {
		return err
	}

	if incumbent != nil && incumbent.id != bid.id {
		if err := incumbent.transitionTo(BidStatusOutbid, now); err != nil {
			return err
		}
	}

	l.updatedAt = now

	return nil
}

// FailBid marks a bid dead because wallet could not hold the gold. The incumbent
// is untouched: a failed challenge changes nothing about who is winning.
func (l *Listing) FailBid(bidID uuid.UUID, now time.Time) error {
	bid := l.findBidByID(bidID)

	if bid == nil {
		return ErrBidNotFound
	}

	if bid.status == BidStatusFailed {
		return nil
	}

	if err := bid.transitionTo(BidStatusFailed, now); err != nil {
		return err
	}

	l.updatedAt = now

	return nil
}

func (l *Listing) WithdrawBid(bidID uuid.UUID, memberID uuid.UUID, now time.Time) error {
	if l.status != StatusActive {
		return ErrListingNotAcceptingBids
	}

	bid := l.findBidByID(bidID)

	if bid == nil {
		return ErrBidNotFound
	}

	// a member may only withdraw their own bid
	if bid.memberID != memberID {
		return ErrNotBidOwner
	}

	// the FSM rejects anything already outbid, won or cancelled
	if err := bid.transitionTo(BidStatusCancelled, now); err != nil {
		return err
	}

	l.updatedAt = now

	return nil
}

// --- Helpers ---
func (l *Listing) findWinningBid() *Bid {
	for _, bid := range l.bids {
		if bid.status != BidStatusWinning {
			continue
		}
		return bid
	}

	return nil
}

// findContendingBid returns whoever currently holds or is claiming the lead:
// the confirmed WINNING bid, or a PENDING one still waiting on its hold. Used
// for the price threshold, where an unconfirmed bid still sets the bar.
func (l *Listing) findContendingBid() *Bid {
	var contender *Bid

	for _, bid := range l.bids {
		if bid.status != BidStatusWinning && bid.status != BidStatusPending {
			continue
		}
		if contender == nil || bid.amount > contender.amount {
			contender = bid
		}
	}

	return contender
}

func (l *Listing) findBidByIdempotencyKey(key uuid.UUID) *Bid {
	for _, bid := range l.bids {
		if bid.idempotencyKey != key {
			continue
		}
		return bid
	}

	return nil
}

func (l *Listing) findBidByID(bidID uuid.UUID) *Bid {
	for _, bid := range l.bids {
		if bid.id != bidID {
			continue
		}
		return bid
	}

	return nil
}

func (l *Listing) currentPrice() int {
	winning := l.findWinningBid()

	if winning == nil {
		return l.startPrice
	}

	return winning.amount
}

type ReconstituteParams struct {
	ID         uuid.UUID
	SellerID   uuid.UUID
	BuyerID    *uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	SoldPrice  *int
	Status     ListingStatus
	EndsAt     time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Version    int
	Bids       []*BidReconstituteParams
}

func Reconstitute(params ReconstituteParams) (*Listing, error) {
	bids := make([]*Bid, 0, len(params.Bids))

	for _, bid := range params.Bids {
		bids = append(bids, &Bid{
			id:             bid.ID,
			listingID:      bid.ListingID,
			memberID:       bid.MemberID,
			bidType:        bid.Type,
			amount:         bid.Amount,
			status:         bid.Status,
			idempotencyKey: bid.IdempotencyKey,
			createdAt:      bid.CreatedAt,
			updatedAt:      bid.UpdatedAt,
		})
	}

	// reconstitute core listing from params and its bids
	listing := Listing{
		id:         params.ID,
		sellerID:   params.SellerID,
		buyerID:    params.BuyerID,
		itemID:     params.ItemID,
		startPrice: params.StartPrice,
		soldPrice:  params.SoldPrice,
		status:     params.Status,
		endsAt:     params.EndsAt,
		bids:       bids,
		createdAt:  params.CreatedAt,
		updatedAt:  params.UpdatedAt,
		version:    params.Version,
	}

	winners := 0
	for _, bid := range listing.bids {
		if bid.status != BidStatusWinning {
			continue
		}
		winners++
	}

	if winners > 1 {
		return nil, ErrCorruptListingState
	}

	return &listing, nil
}
