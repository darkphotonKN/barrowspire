package grpc

// Tracing decorators for the read-side interfaces this handler consumes. Each
// generated *WithTracing type wraps a query at the injection site
// (internal/config/services.go), so the query shows as its own span above the
// sql.conn.* spans otelsql records. Regenerate with
// `go generate -run gowrap ./...`; never hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i MyListingsReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.MyListingsReader -o my_listings_reader_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i MyBidsReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.MyBidsReader -o my_bids_reader_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i BrowseListingsReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.BrowseListingsReader -o browse_listings_reader_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i ListingReader -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=query.ListingReader -o listing_reader_trace.go
