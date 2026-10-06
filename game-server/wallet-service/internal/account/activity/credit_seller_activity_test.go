package activity

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubCreditSeller struct {
	accountID uuid.UUID
	err       error
	calls     int
	gotCmd    *usecase.CreditSellerCommand
}

func (s *stubCreditSeller) Handle(ctx context.Context, cmd *usecase.CreditSellerCommand) (uuid.UUID, error) {
	s.calls++
	s.gotCmd = cmd
	return s.accountID, s.err
}

func newCreditSellerEnv(uc CreditSeller) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, nil, uc).Register(env)
	return env
}

func TestCreditSellerActivity_ReturnsTheSellersAccount(t *testing.T) {
	uc := &stubCreditSeller{accountID: uuid.New()}
	in := walletactivity.CreditSellerInput{
		SellerID:       uuid.New(),
		Amount:         250,
		IdempotencyKey: "settlement-" + uuid.NewString() + ":CreditSeller",
	}

	val, err := newCreditSellerEnv(uc).ExecuteActivity(walletactivity.CreditSellerActivityName, in)
	require.NoError(t, err)

	var out walletactivity.CreditSellerOutput
	require.NoError(t, val.Get(&out))

	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.SellerID, uc.gotCmd.SellerID)
	assert.Equal(t, 250, uc.gotCmd.Amount)
	assert.Equal(t, in.IdempotencyKey, uc.gotCmd.IdempotencyKey, "the caller's key reaches the dedup unchanged")
	assert.Equal(t, walletactivity.CreditSellerOutput{SellerWalletAccountID: uc.accountID}, out)
}

// Past the pivot a non-retryable error means escalate and park (§Req 13), never
// roll back. The set is small on purpose: the buyer has already paid, so a
// transient failure mislabelled as impossible strands the seller's proceeds behind
// an operator instead of a retry. "Wallet down after the pivot" (Edge States) must
// stay retryable so the default tail policy, not an invariant breach, governs it.
func TestCreditSellerActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"the seller has no account", commonconstants.ErrNotFound, true},
		{"a non-positive settlement amount", account.ErrInvalidGold, true},
		{"no idempotency key", usecase.ErrMissingIdempotencyKey, true},
		{"wallet is down", errors.New("dial tcp: connection refused"), false},
		{"a transient database error", commonconstants.ErrTransient, false},
		{"lost the row version every time", fmt.Errorf("%w: %w", usecase.ErrMaxRetries, account.ErrConcurrentModification), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubCreditSeller{err: fmt.Errorf("credit seller uc handle: %w", tt.err)}

			_, err := newCreditSellerEnv(uc).ExecuteActivity(walletactivity.CreditSellerActivityName,
				walletactivity.CreditSellerInput{SellerID: uuid.New(), Amount: 250, IdempotencyKey: "k"})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
		})
	}
}
