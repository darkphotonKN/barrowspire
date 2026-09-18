package walletactivity_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/activitytest"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/google/uuid"
)

func TestCommitHoldInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "commit_hold_input.json", walletactivity.CommitHoldInput{
		WinnerBidID:    uuid.MustParse("44444444-4444-4444-8444-444444444444"),
		ExpectedAmount: 250,
	})
}

func TestCommitHoldOutput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "commit_hold_output.json", walletactivity.CommitHoldOutput{
		BuyerWalletAccountID: uuid.MustParse("66666666-6666-4666-8666-666666666666"),
		CommittedAmount:      250,
	})
}

func TestReleaseLosingHoldsInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "release_losing_holds_input.json", walletactivity.ReleaseLosingHoldsInput{
		ListingID:   uuid.MustParse("11111111-1111-4111-8111-111111111111"),
		WinnerBidID: uuid.MustParse("44444444-4444-4444-8444-444444444444"),
		LosingBidIDs: []uuid.UUID{
			uuid.MustParse("88888888-8888-4888-8888-888888888888"),
			uuid.MustParse("99999999-9999-4999-8999-999999999999"),
		},
	})
}

func TestReleaseLosingHoldsOutput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "release_losing_holds_output.json", walletactivity.ReleaseLosingHoldsOutput{
		ReleasedCount: 2,
	})
}

func TestCreditSellerInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "credit_seller_input.json", walletactivity.CreditSellerInput{
		SellerID:       uuid.MustParse("33333333-3333-4333-8333-333333333333"),
		Amount:         250,
		IdempotencyKey: "settlement-11111111-1111-4111-8111-111111111111:CreditSeller",
	})
}

func TestCreditSellerOutput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "credit_seller_output.json", walletactivity.CreditSellerOutput{
		SellerWalletAccountID: uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
	})
}

func TestReleaseAllHoldsInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "release_all_holds_input.json", walletactivity.ReleaseAllHoldsInput{
		ListingID: uuid.MustParse("11111111-1111-4111-8111-111111111111"),
	})
}
