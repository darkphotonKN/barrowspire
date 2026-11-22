package grpc

// Tracing decorators for the read-side interfaces this handler consumes. Each
// generated *WithTracing type wraps a query at the injection site
// (internal/config/services.go), so the query shows as its own span above the
// sql.conn.* spans otelsql records. Regenerate with
// `go generate -run gowrap ./...`; never hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i AccountReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.AccountReader -o account_reader_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i StaleHoldsReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.StaleHoldsReader -o stale_holds_reader_trace.go
