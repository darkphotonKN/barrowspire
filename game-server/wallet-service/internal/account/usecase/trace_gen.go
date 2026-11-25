package usecase

// Tracing decorators for the storage interfaces these use cases own. Each
// generated *WithTracing type wraps the concrete repository or query at the
// injection site (internal/config/services.go), so every call shows as its
// own span above the sql.conn.* spans otelsql records. Regenerate with
// `go generate -run gowrap ./...`; never hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i accountWriter -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=account.Repository -v DecoratorName=AccountWriterWithTracing -o account_writer_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i creditAccounts -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=account.Repository -v DecoratorName=CreditAccountsWithTracing -o credit_accounts_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i debitAccounts -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=account.Repository -v DecoratorName=DebitAccountsWithTracing -o debit_accounts_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i sellerAccounts -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=account.Repository -v DecoratorName=SellerAccountsWithTracing -o seller_accounts_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i activityMarker -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=repository.ProcessedActivity -v DecoratorName=ActivityMarkerWithTracing -o activity_marker_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i expiredHolds -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.ExpiredHolds -v DecoratorName=ExpiredHoldsWithTracing -o expired_holds_trace.go
