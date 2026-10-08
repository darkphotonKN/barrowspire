package query

// The price facts every listing read carries (FS-8EGFA §Requirements 5), as one
// SQL piece any listing read composes: select priceFactsColumns and add
// priceFactsJoin after `FROM listings AS l`. The rows scan into
// dto.ListingDetails, whose embedded dto.PriceFacts takes these two columns and
// derives the minimum bid from them.
//
// The statuses mirror the aggregate, which is the rule's owner:
//
//   - leading (current_price) is WINNING or PENDING — findContendingBid, the bar
//     PlaceBidWithID measures a new bid against. An unconfirmed PENDING bid sets
//     it too.
//   - counted (bid_count) adds OUTBID: bids that were in the running.
//     CANCELLED (withdrawn), FAILED (no hold), and settlement's WON and LOST are
//     left out.
//
// Aggregates without GROUP BY always answer one row, so the lateral join never
// drops a listing that has no bids: its count is 0 and its price is NULL.

const priceFactsColumns = `
		pf.bid_count,
		pf.current_price`

const priceFactsJoin = `
	CROSS JOIN LATERAL (
		SELECT
			count(*) FILTER (WHERE b.status IN ('WINNING', 'PENDING', 'OUTBID')) AS bid_count,
			max(b.amount) FILTER (WHERE b.status IN ('WINNING', 'PENDING')) AS current_price
		FROM bids AS b
		WHERE b.listing_id = l.id
	) AS pf`
