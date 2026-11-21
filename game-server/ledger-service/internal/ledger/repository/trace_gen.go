package repository

// Tracing decorators for the ledger domain's Repository port. They live here,
// not in the domain package, so the domain stays free of tracing. Each
// generated *WithTracing type wraps the concrete repository at the injection
// site (internal/config/services.go), so every call shows as its own span
// above the sql.conn.* spans otelsql records. Regenerate with
// `go generate -run gowrap ./...`; never hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p ../domain/ledger -i Repository -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=ledger.Repository -v DecoratorName=LedgerRepositoryWithTracing -o ledger_repository_trace.go
