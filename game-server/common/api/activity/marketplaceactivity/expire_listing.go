package marketplaceactivity

import "github.com/google/uuid"

// ExpireListingActivityName is step NB2, the no-bids arm's last step: a frozen
// listing nobody won reaches its terminal EXPIRED status. Runs after NB1 has
// returned the item to its seller.
const ExpireListingActivityName = "ExpireListing"

type ExpireListingInput struct {
	ListingID uuid.UUID `json:"listing_id"`
}
