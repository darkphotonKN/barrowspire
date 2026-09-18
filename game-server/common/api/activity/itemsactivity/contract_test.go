package itemsactivity_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/activitytest"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
)

func TestFreezeItemInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "freeze_item_input.json", itemsactivity.FreezeItemInput{
		ItemID:   uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		SellerID: uuid.MustParse("33333333-3333-4333-8333-333333333333"),
	})
}

func TestTransferItemInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "transfer_item_input.json", itemsactivity.TransferItemInput{
		ItemID:        uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		BuyerMemberID: uuid.MustParse("55555555-5555-4555-8555-555555555555"),
	})
}

func TestUnfreezeItemInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "unfreeze_item_input.json", itemsactivity.UnfreezeItemInput{
		ItemID:   uuid.MustParse("22222222-2222-4222-8222-222222222222"),
		SellerID: uuid.MustParse("33333333-3333-4333-8333-333333333333"),
	})
}
