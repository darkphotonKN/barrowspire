package listing

// Handler carries the clients the typed operations in typed.go forward to. It
// holds no HTTP code of its own: every marketplace route is registered through
// RegisterOperations.
type Handler struct {
	client ListingClient
	items  ItemSummaries
}

func NewHandler(client ListingClient, items ItemSummaries) *Handler {
	return &Handler{
		client: client,
		items:  items,
	}
}
