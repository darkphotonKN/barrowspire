package member

// Tracing decorators for the storage interfaces this package consumes. Each
// generated *WithTracing type wraps the concrete repository at the injection
// site (cmd/server/main.go), so every call shows as its own span above the
// sql.conn.* spans otelsql records. Regenerate with `go generate -run gowrap ./...`; never
// hand-edit the *_trace.go files.

//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i Repository -t ../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=member.Repository -o repository_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i VerificationCodeWriter -t ../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=member.Repository -o verification_code_writer_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i VerificationStore -t ../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=member.Repository -o verification_store_trace.go
//go:generate go run github.com/hexdigest/gowrap/cmd/gowrap@v1.4.3 gen -g -p . -i accountIDWriter -t ../../../common/tracing/gowrap/repository.tmpl -v SpanNamePrefix=member.Repository -v DecoratorName=AccountIDWriterWithTracing -o account_id_writer_trace.go
