package ledger

// Handler holds this group's downstream client for the typed operations in
// typed.go.
//
// There are no gin methods here and there must not be. Every other group in
// this gateway carries legacy gin handlers alongside its typed operations
// because those groups predate FS-0002; the ledger read path is serialized from
// birth (FS-0003 §Requirements 32), so its only surface is the typed one.
//
// The client may be nil: registration records types and metadata without
// invoking a handler, which is what lets cmd/openapi build the document
// without dialing Consul.
type Handler struct {
	client LedgerClient
}

func NewHandler(client LedgerClient) *Handler {
	return &Handler{
		client: client,
	}
}
