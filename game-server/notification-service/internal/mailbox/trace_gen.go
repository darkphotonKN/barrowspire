package mailbox

// Tracing decorators for the storage interfaces this package consumes. Each
// generated *WithTracing type wraps the concrete repository at the injection
// site (config/routes.go), so every call shows as its own span above the
// sql.conn.* spans otelsql records. Regenerate with `go generate -run gowrap ./...`; never
// hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i Repository -t ../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=mailbox.Repository -o repository_trace.go
