package repository

// Tracing decorator for the account domain's Repository port. It lives here,
// not in the domain package, so the domain stays free of tracing. The
// generated *WithTracing type wraps the concrete repository at the injection
// site (internal/config/services.go), so every call shows as its own span
// above the sql.conn.* spans otelsql records. Regenerate with
// `go generate -run gowrap ./...`; never hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p ../domain/account -i Repository -t ../../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=account.Repository -v DecoratorName=AccountRepositoryWithTracing -o account_repository_trace.go
