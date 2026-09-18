package marketplaceactivity

import "github.com/google/uuid"

// MarkSoldActivityName is step 6: the listing reaches its terminal SOLD status.
// Past the pivot, so it rolls forward — it escalates and parks, never fails.
const MarkSoldActivityName = "MarkSold"

type MarkSoldInput struct {
	ListingID uuid.UUID `json:"listing_id"`
}
