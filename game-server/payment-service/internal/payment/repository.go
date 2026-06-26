package payment

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type Repository interface {
	UpsertSubscription(ctx context.Context, sub *Subscription) error
	GetSubscriptionsByUserID(ctx context.Context, userID uuid.UUID) ([]Subscription, error)
}

type repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) Repository {
	return &repository{db: db}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("payment repo", op, err)
}

func (r *repository) UpsertSubscription(ctx context.Context, sub *Subscription) error {
	query := `
		INSERT INTO subscriptions (
			id, user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
			status, current_period_start, current_period_end, cancel_at_period_end, canceled_at
		) VALUES (
			:id, :user_id, :stripe_customer_id, :stripe_subscription_id, :stripe_price_id,
			:status, :current_period_start, :current_period_end, :cancel_at_period_end, :canceled_at
		)
		ON CONFLICT (stripe_subscription_id) DO UPDATE SET
			status = EXCLUDED.status,
			stripe_price_id = EXCLUDED.stripe_price_id,
			current_period_start = EXCLUDED.current_period_start,
			current_period_end = EXCLUDED.current_period_end,
			cancel_at_period_end = EXCLUDED.cancel_at_period_end,
			canceled_at = EXCLUDED.canceled_at,
			updated_at = NOW()
	`

	_, err := r.db.NamedExecContext(ctx, query, sub)
	if err != nil {
		return wrapDBErr("upsert subscription", err)
	}
	return nil
}

func (r *repository) GetSubscriptionsByUserID(ctx context.Context, userID uuid.UUID) ([]Subscription, error) {
	var subs []Subscription
	query := `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC`

	err := r.db.SelectContext(ctx, &subs, query, userID)
	if err != nil {
		return nil, wrapDBErr("get subscriptions by user id", err)
	}
	return subs, nil
}
