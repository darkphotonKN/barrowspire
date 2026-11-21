package usecase

// Tracing decorators for the storage interfaces these use cases own. Each
// generated *WithTracing type wraps the concrete repository or query at the
// injection site (internal/config/services.go), so every call shows as its
// own span above the sql.conn.* spans otelsql records. Regenerate with
// `go generate -run gowrap ./...`; never hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i ListingWithdrawalMarker -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=listing.Repository -o listing_withdrawal_marker_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i SettlementExceptionRaiser -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=repository.SettlementException -o settlement_exception_raiser_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i SettlementExceptionResolver -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=repository.SettlementException -o settlement_exception_resolver_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i CancelledListingFinder -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.CancelledListingFinder -o cancelled_listing_finder_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i ExpiredListingFinder -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.ExpiredListingFinder -o expired_listing_finder_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i BidReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.BidReader -o bid_reader_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i ReconcileReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.ReconcileReader -o reconcile_reader_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i ConfirmedReservationReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.ConfirmedReservationReader -o confirmed_reservation_reader_trace.go
