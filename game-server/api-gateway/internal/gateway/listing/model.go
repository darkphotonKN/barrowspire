package listing

import (
	"context"
	"fmt"
	"time"

	itempb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	pbshared "github.com/darkphotonKN/barrowspire-server/common/api/proto/shared/v1"
)

type ListingClient interface {
	ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error)
	PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error)
	WithdrawBid(ctx context.Context, req *pb.WithdrawBidRequest) (*pb.WithdrawBidResponse, error)
	AcceptBid(ctx context.Context, req *pb.AcceptBidRequest) (*pb.AcceptBidResponse, error)
	ListMyListings(ctx context.Context, req *pb.ListMyListingsRequest) (*pb.ListMyListingsResponse, error)
	BrowseListings(ctx context.Context, req *pb.BrowseListingsRequest) (*pb.BrowseListingsResponse, error)
	GetListing(ctx context.Context, req *pb.GetListingRequest) (*pb.GetListingResponse, error)
}

// ItemSummaries is the one thing the listing operations need from items: the
// public facts of the items a page of listings names. The gateway's item client
// satisfies it.
type ItemSummaries interface {
	GetItemSummaries(ctx context.Context, req *itempb.GetItemSummariesRequest) (*itempb.GetItemSummariesResponse, error)
}

// CreateListingBody is the wire shape of a listing request. The seller comes
// from the token, so the item and the auction terms are all the caller supplies.
// Only shape is checked here; whether the end time is in the future is
// marketplace's rule and comes back through the seam.
type CreateListingBody struct {
	ItemID     string `json:"itemId" format:"uuid" doc:"The item to list. It must be in the seller's stash and not already listed."`
	StartPrice int64  `json:"startPrice" minimum:"1" doc:"Gold the first bid must meet."`
	// optional; that it clears the start price is marketplace's rule
	BuyoutPrice *int64    `json:"buyoutPrice,omitempty" minimum:"1" doc:"Gold that buys the item outright and ends the auction. Optional; when set it must be above startPrice."`
	EndsAt      time.Time `json:"endsAt" doc:"When the auction closes. Must be in the future."`
}

// PlaceBidBody is the wire shape of a bid. The listing comes from the path and
// the bidder from the token, so the amount is all the caller supplies.
type PlaceBidBody struct {
	Amount int64 `json:"amount" minimum:"1" doc:"Gold offered. The first bid must meet the listing's start price; every later one must exceed the current leading bid. On a listing with a buyoutPrice every bid must stay below it."`
}

// Listing is a listing as its seller sees it. The optimistic-locking version is
// internal to marketplace and has no field here.
type Listing struct {
	ID          string    `json:"id" format:"uuid"`
	ItemID      string    `json:"itemId" format:"uuid"`
	SellerID    string    `json:"sellerId" format:"uuid"`
	BuyerID     *string   `json:"buyerId,omitempty" format:"uuid" doc:"Present once sold."`
	StartPrice  int64     `json:"startPrice"`
	BuyoutPrice *int64    `json:"buyoutPrice,omitempty" doc:"Gold that buys the item outright. Absent when the seller set none."`
	SoldPrice   *int64    `json:"soldPrice,omitempty" doc:"Present once sold."`
	Status      string    `json:"status" doc:"Listing status, e.g. ACTIVE, PENDING_SETTLEMENT, SOLD, SETTLEMENT_FAILED."`
	EndsAt      time.Time `json:"endsAt"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	// Price facts. Marketplace computes all three; nothing here restates the
	// increment rule.
	CurrentPrice *int64 `json:"currentPrice,omitempty" doc:"The leading bid. Absent when nobody leads."`
	MinimumBid   int64  `json:"minimumBid" minimum:"1" doc:"The least amount a bid would be accepted at now: the start price with no leading bid, otherwise one more than the leading bid."`
	BidCount     int32  `json:"bidCount" minimum:"0" doc:"Bids that are or were in the running: winning, pending or outbid."`
	Ended        bool   `json:"ended" doc:"True when the auction is past endsAt but not yet settled; it no longer accepts bids."`

	Item *ItemSummary `json:"item,omitempty" doc:"The listed item. Absent only when items has no such instance."`
}

// ItemSummary is what anyone may see of a listed item. It has no owner, source
// or price: items never sends them.
type ItemSummary struct {
	ID          string  `json:"id" format:"uuid" doc:"The item instance; equals the listing's itemId."`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	ItemType    string  `json:"itemType" doc:"e.g. weapon, armor, consumable."`
	Rarity      string  `json:"rarity" doc:"The rarity tier: normal, uncommon, rare, runed or fabled."`
	WeaponType  *string `json:"weaponType,omitempty"`
	ArmorSlot   *string `json:"armorSlot,omitempty"`

	AttackPower     *int32   `json:"attackPower,omitempty"`
	CriticalRate    *float64 `json:"criticalRate,omitempty"`
	DefenseRating   *int32   `json:"defenseRating,omitempty"`
	MagicResistance *int32   `json:"magicResistance,omitempty"`
	HealingAmount   *int32   `json:"healingAmount,omitempty"`
	ManaAmount      *int32   `json:"manaAmount,omitempty"`
	BuffDuration    *int32   `json:"buffDuration,omitempty"`
}

// ListingPage is one page of listings, in the order the operation documents.
type ListingPage struct {
	Listings   []Listing `json:"listings" nullable:"false"`
	NextCursor *string   `json:"nextCursor,omitempty" doc:"Pass back as cursor for the next page. Absent on the last page."`
}

func itemSummaryFromProto(s *itempb.ItemSummary) *ItemSummary {
	return &ItemSummary{
		ID:              s.GetId(),
		Name:            s.GetName(),
		Description:     s.Description,
		ItemType:        s.GetItemType(),
		Rarity:          s.GetRarity(),
		WeaponType:      s.WeaponType,
		ArmorSlot:       s.ArmorSlot,
		AttackPower:     s.AttackPower,
		CriticalRate:    s.CriticalRate,
		DefenseRating:   s.DefenseRating,
		MagicResistance: s.MagicResistance,
		HealingAmount:   s.HealingAmount,
		ManaAmount:      s.ManaAmount,
		BuffDuration:    s.BuffDuration,
	}
}

// listingFromProto maps one marketplace listing to the wire. A listing missing
// a required timestamp is a fault in marketplace, answered as 500 rather than
// shown to the client as 1970.
func listingFromProto(l *pb.Listing) (Listing, error) {
	if l.GetEndsAt() == nil || l.GetCreatedAt() == nil || l.GetUpdatedAt() == nil {
		return Listing{}, fmt.Errorf("marketplace returned listing %s without a required timestamp", l.GetId())
	}

	return Listing{
		ID:          l.GetId(),
		ItemID:      l.GetItemId(),
		SellerID:    l.GetSellerId(),
		BuyerID:     l.BuyerId,
		StartPrice:  l.GetStartPrice(),
		BuyoutPrice: l.BuyoutPrice,
		SoldPrice:   l.SoldPrice,
		Status:      l.GetStatus(),
		EndsAt:      l.GetEndsAt().AsTime(),
		CreatedAt:   l.GetCreatedAt().AsTime(),
		UpdatedAt:   l.GetUpdatedAt().AsTime(),

		CurrentPrice: l.CurrentPrice,
		MinimumBid:   l.GetMinimumBid(),
		BidCount:     l.GetBidCount(),
		Ended:        l.GetEnded(),
	}, nil
}

// listingPageFromProto maps marketplace's page to the wire.
func listingPageFromProto(in []*pb.Listing, pagination *pbshared.PageInfo) (ListingPage, error) {
	listings := make([]Listing, 0, len(in))
	for _, l := range in {
		listing, err := listingFromProto(l)
		if err != nil {
			return ListingPage{}, err
		}
		listings = append(listings, listing)
	}

	page := ListingPage{Listings: listings}
	if next := pagination.GetNextCursor(); next != "" {
		page.NextCursor = &next
	}

	return page, nil
}
