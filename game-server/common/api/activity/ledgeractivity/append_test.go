package ledgeractivity_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/activitytest"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/ledgeractivity"
	"github.com/google/uuid"
)

func TestAppendLedgerTxInput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "append_ledger_tx_input.json", ledgeractivity.AppendLedgerTxInput{
		TransactionID: uuid.MustParse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
		Reason:        "AUCTION_SETTLEMENT",
		Currency:      "GOLD",
		ReferenceID:   uuid.MustParse("11111111-1111-4111-8111-111111111111"),
		Legs: []ledgeractivity.Leg{
			{
				AccountID: uuid.MustParse("66666666-6666-4666-8666-666666666666"),
				Amount:    250,
				Direction: "DEBIT",
			},
			{
				AccountID: uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
				Amount:    250,
				Direction: "CREDIT",
			},
		},
	})
}

func TestAppendLedgerTxOutput_MatchesGolden(t *testing.T) {
	activitytest.Golden(t, "append_ledger_tx_output.json", ledgeractivity.AppendLedgerTxOutput{
		Applied: true,
	})
}
