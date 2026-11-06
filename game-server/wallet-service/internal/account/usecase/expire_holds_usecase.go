package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/google/uuid"
)

// expiredHolds is the candidate read: one page of RESERVED holds the database
// clock says have lapsed, in (expired_at, bid_id) order, starting after the given
// keyset position (nil for the first page) and holding at most limit rows.
type expiredHolds interface {
	Execute(ctx context.Context, after *dto.ExpiredHold, limit int) ([]dto.ExpiredHold, error)
}

// holdAccounts is all of the account store a sweep touches: load the Account
// that owns a hold by the hold's bid, save it under the aggregate's version.
type holdAccounts interface {
	FindByBidID(ctx context.Context, bidID uuid.UUID) (*account.Account, error)
	Save(ctx context.Context, acc *account.Account, before account.AccountSnapshot) error
}

// expireHoldsPage is how many candidates one read brings into memory. The pass
// reads page after page, so this bounds memory, not the pass. It is the only
// page size: the query takes it as given. Tuning, not contract.
const expireHoldsPage = 100

// ExpireHoldsUC is one pass of the hold sweep: wallet's own timeout Cancel of the
// hold's TCC (FS-A3CQH §Req 1, 8). It releases holds whose expiry has passed and
// touches nothing outside this service: no other service is called, and a release
// writes no ledger entry (ADR-0006), outbox row or event (§Req 12).
type ExpireHoldsUC struct {
	candidates expiredHolds
	accounts   holdAccounts
}

func NewExpireHoldsUC(candidates expiredHolds, accounts holdAccounts) *ExpireHoldsUC {
	return &ExpireHoldsUC{candidates: candidates, accounts: accounts}
}

type ExpireHoldsCommand struct {
	Now time.Time
}

// Handle runs one pass and reports how many holds it released.
//
// The pass reads every expired candidate, a page at a time, each page starting
// after the last row of the one before, and ends at the first short page
// (§Req 5, 8). Paging past the end rather than stopping at one page is what keeps
// a hold that fails every time from starving the ones behind it: the keyset moves
// past it whatever happened to it.
//
// Failures are isolated per hold (§Req 9): one that cannot be loaded or saved,
// OCC retries exhausted included, is warned about and skipped, and the next pass
// tries it again. Only a failed candidate read fails the pass, since without it
// there is nothing to do. Shutdown stops the pass between pages and between
// holds; the next start reads from the first page again.
func (uc *ExpireHoldsUC) Handle(ctx context.Context, cmd *ExpireHoldsCommand) (int, error) {
	released := 0
	var after *dto.ExpiredHold

	for {
		if err := ctx.Err(); err != nil {
			return released, stopped(released, err)
		}

		page, err := uc.candidates.Execute(ctx, after, expireHoldsPage)
		if err != nil {
			return released, fmt.Errorf("expire holds uc read candidates: %w", err)
		}

		for _, hold := range page {
			// shutdown: stop between holds rather than fail every one left; the
			// next start picks them up from the query
			if err := ctx.Err(); err != nil {
				return released, stopped(released, err)
			}

			ok, err := uc.expireOne(ctx, hold.BidID, cmd.Now)

			// the candidate list is the database clock's opinion; ours says the
			// hold still backs a bid. Not a failure: it is released a pass later
			// (§Req 6)
			if errors.Is(err, account.ErrHoldNotExpired) {
				continue
			}
			if err != nil {
				// a load or save cut short by shutdown is the pass stopping, not
				// a hold it skipped
				if ctxErr := ctx.Err(); ctxErr != nil {
					return released, stopped(released, ctxErr)
				}
				slog.WarnContext(ctx, "hold sweep skipped a hold", "bid_id", hold.BidID, "error", err)
				continue
			}
			if ok {
				released++
			}
		}

		if len(page) < expireHoldsPage {
			break
		}
		after = &page[len(page)-1]
	}

	slog.InfoContext(ctx, "hold sweep pass done", "released", released)

	return released, nil
}

func stopped(released int, err error) error {
	return fmt.Errorf("expire holds uc stopped after %d released: %w", released, err)
}

// expireOne decides one hold again inside the aggregate, under load, modify, save
// with OCC, so a sweep racing a commit, a release or another replica resolves as
// exactly one TCC outcome (§Req 2, 10). It reports whether this call released the
// hold: a hold already COMMITTED or RELEASED, including one a race just settled,
// is false with no error and nothing saved.
func (uc *ExpireHoldsUC) expireOne(ctx context.Context, bidID uuid.UUID, now time.Time) (bool, error) {
	released := false

	err := withRetry(ctx, func() error {
		acc, err := uc.accounts.FindByBidID(ctx, bidID)
		if err != nil {
			return fmt.Errorf("FindByBidID: %w", err)
		}

		before := acc.Snapshot()

		released, err = acc.ExpireHold(bidID, now)
		if err != nil {
			return fmt.Errorf("ExpireHold: %w", err)
		}

		if !released {
			return nil
		}

		if err := uc.accounts.Save(ctx, acc, before); err != nil {
			released = false
			return fmt.Errorf("Save: %w", err)
		}

		return nil
	})

	return released, err
}
