package itemsactivity

import "github.com/google/uuid"

const ReturnItemActivityName = "ReturnItem"

type ReturnItemInput struct {
	ItemID    uuid.UUID `json:"item_id"`
	ListingID uuid.UUID `json:"listing_id"`
}

type ReturnItemOutput struct {
}
