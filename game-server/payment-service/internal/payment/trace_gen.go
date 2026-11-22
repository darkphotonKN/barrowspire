package payment

// Tracing decorator for the storage interface this package consumes. The
// generated RepositoryWithTracing wraps the concrete repository at the
// injection site (cmd/server/main.go), so every call shows as its own span above the
// sql.conn.* spans otelsql records. Regenerate with `go generate -run gowrap ./...`; never
// hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i Repository -t ../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=payment.Repository -o repository_trace.go
