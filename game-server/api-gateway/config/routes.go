package config

import (
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	authService "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/ledger"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/listing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/character"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/notification"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/payment"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/stats"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/wallet"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

// Downstreams are the gRPC addresses ("host:port") of every service the gateway
// fans out to. They come from env, so the same binary runs natively
// (localhost:<port>), in compose, or in Kubernetes (<service>:<port>).
type Downstreams struct {
	Auth         string
	Stats        string
	Notification string
	Payment      string
	Items        string
	Ledger       string
	Marketplace  string
	Wallet       string
	Character    string
}

/**
* Sets up API prefix route and all routers.
*
* corsOrigins is the explicit list of browser origins allowed to call the API
* (the frontend's URLs). Never "*".
*
* The returned close func releases every downstream connection; call it on
* shutdown.
**/
func SetupRouter(addrs Downstreams, corsOrigins []string, ch *amqp.Channel) (*gin.Engine, func() error, error) {
	var conns []io.Closer
	closeAll := func() error {
		var errs []error
		for _, c := range conns {
			errs = append(errs, c.Close())
		}
		return errors.Join(errs...)
	}
	// fail tears down whatever was already dialed before reporting the error
	fail := func(err error) (*gin.Engine, func() error, error) {
		return nil, nil, errors.Join(err, closeAll())
	}

	// gin.New(), not gin.Default(): Default() installs gin's stock Recovery,
	// which writes a 500 with an EMPTY BODY and so is the one failure path that
	// bypasses the error contract (FS-22WKC §Edge States). Default() also installs
	// gin.Logger(), which is re-attached below — dropping it silently was the
	// second half of this trap.
	router := gin.New()

	// --- Middlewares ---

	// Recovery FIRST. Middleware registered before it panics outside its scope,
	// and a panic in CORS or tracing would produce the empty 500 all over again.
	router.Use(httperr.Recovery())

	// skip /healthz: LB probes it every few seconds; failures still show as an unhealthy LB backend and in `kubectl describe pod`
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/healthz"}}))

	// CORS: only the frontend origins from CORS_ORIGINS may call the API from a browser.
	router.Use(cors.New(cors.Config{
		AllowOrigins: corsOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		// Idempotency-Key: bids and buyouts send it, so the preflight must allow it
		AllowHeaders: []string{"Content-Type", "Authorization", "Idempotency-Key"},
		// auth is a Bearer header, not a cookie, so no credentials mode
		AllowCredentials: false,
		// browser caches the preflight, fewer OPTIONS round trips
		MaxAge: 12 * time.Hour,
	}))

	router.Use(otelgin.Middleware("api-gateway"))

	// load balancer and readiness health check
	router.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) })

	// base route
	api := router.Group("/api")

	/***************
	* MICROSERVICES
	***************/

	// --- AUTH & MEMBERS MICROSERVICE ---

	// -- Member Setup (gRPC - for private routes) --
	authClient, err := authService.NewClient(addrs.Auth)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, authClient)
	authHandler := authService.NewHandler(authClient)

	// Member Setup amqp

	// Member routes are SERIALIZED (FS-NTPW2 slice 1). All eight are declared as
	// typed operations in internal/gateway/auth/typed.go and mounted below via
	// contract.RegisterOperations, so openapi.yaml describes them and the docs
	// UI serves them.
	//
	// Their JWT middleware is attached per-operation rather than to a gin group:
	// Huma registers on the engine, so a group middleware would never run for
	// them. See contract.Protected.

	// --- STATS MICROSERVICE ---

	statsClient, err := stats.NewClient(addrs.Stats)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, statsClient)
	statsHandler := stats.NewHandler(statsClient)

	// Stats routes are SERIALIZED (FS-NTPW2 slice 3) and remain PUBLIC — no
	// AuthMiddleware, exactly as before. See internal/gateway/stats/typed.go.

	// --- GAME SERVICE: DELIBERATELY ABSENT ---
	//
	// There is no game route here and there should not be one. game-service owns
	// its entire client surface — HTTP and WebSocket — and clients connect to it
	// directly; in production an INFRASTRUCTURE gateway routes to it, not this
	// application gateway (ADR-0004).
	//
	// This replaces a "TODO: add game service routes when implemented" block.
	// That TODO was the only trace of the idea and it invited exactly the change
	// the ADR rejects: proxying would make this edge stateful, amplify a 30Hz
	// broadcast through the one component every other service depends on, and
	// round-robin connections across pods that hold pinned world state.

	// --- NOTIFICATION MICROSERVICE ---

	notificationClient, err := notification.NewClient(addrs.Notification)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, notificationClient)
	notificationHandler := notification.NewHandler(notificationClient)
	// Notification routes are SERIALIZED (FS-NTPW2 slice 3).
	// --- PAYMENT MICROSERVICE ---

	paymentClient, err := payment.NewClient(addrs.Payment)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, paymentClient)
	paymentHandler := payment.NewHandler(paymentClient)

	// No player-facing payment routes (FS-RG1B4): only the webhook Stripe calls.
	// Stripe Webhook (no auth - Stripe sends POST directly)
	router.POST("/webhook/stripe", paymentHandler.WebhookHandler)

	// --- ITEMS MICROSERVICE ---

	itemClient, err := item.NewClient(addrs.Items)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, itemClient)
	itemHandler := item.NewHandler(itemClient)

	//   --- LEDGER MICROSERVICE ---

	ledgerClient, err := ledger.NewClient(addrs.Ledger)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, ledgerClient)
	ledgerHandler := ledger.NewHandler(ledgerClient)

	// --- LISTING MICROSERVICE ---

	// Listing routes are SERIALIZED (FS-0YXG6). Every one is a typed operation
	// in internal/gateway/listing/typed.go, mounted below.
	listingClient, err := listing.NewClient(addrs.Marketplace)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, listingClient)
	// items rides along for the item summaries joined onto every listing read
	listingHandler := listing.NewHandler(listingClient, itemClient)

	// Item routes are SERIALIZED (FS-NTPW2 slice 2). All eleven are typed
	// operations in internal/gateway/item/typed.go, mounted below.

	// --- WALLET MICROSERVICE ---

	// Built here, ahead of the contract mount, because GET /wallet/account is a
	// typed operation (FS-8EGFA). The remaining gin routes are mounted below.
	walletClient, err := wallet.NewClient(addrs.Wallet)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, walletClient)
	walletHandler := wallet.NewHandler(walletClient)

	// --- CHARACTERS MICROSERVICE ---

	// Character routes are SERIALIZED (FS-BDA7X): create, list, get and delete
	// are typed, protected operations in internal/gateway/character/typed.go.
	// The legacy gin POST /api/character/ was replaced, not wrapped (ADR-0002
	// §5), so no gin route owns a character path.
	characterClient, err := character.NewClient(addrs.Character)
	if err != nil {
		return fail(err)
	}
	conns = append(conns, characterClient)
	characterHandler := character.NewHandler(characterClient)

	// --- SERIALIZED CONTRACT (FS-NTPW2) ---
	//
	// Mounted after every legacy route so it is obvious that Huma is added to
	// this router rather than replacing it. Groups join RegisterOperations one
	// slice at a time; everything not yet listed there is still legacy gin above.
	contract.RegisterOperations(contract.New(router), contract.Deps{
		Auth:           authHandler,
		Items:          itemHandler,
		Notification:   notificationHandler,
		Stats:          statsHandler,
		Ledger:         ledgerHandler,
		Listing:        listingHandler,
		Wallet:         walletHandler,
		Characters:     characterHandler,
		AuthMiddleware: auth.AuthMiddleware(),
	})

	// An unrouted path is the one 4xx gin answers on its own — no handler runs, so
	// the seam never sees it, and the client gets a bare text/plain 404 with no
	// `code`. Registered last because NoRoute is the fallback for everything above.
	router.NoRoute(httperr.NotFoundHandler())

	// --- WALLET MICROSERVICE ---

	walletRoutes := api.Group("/wallet")
	// Every wallet RPC derives the account from the authenticated member, so
	// there are no public routes here.
	//
	// GET /account is SERIALIZED (FS-8EGFA): a typed operation in
	// internal/gateway/wallet/typed.go, mounted by contract.RegisterOperations.
	// Gin and Huma cannot both own it, so it is not registered here.
	walletRoutes.Use(auth.AuthMiddleware())
	walletRoutes.POST("/account", walletHandler.CreateAccountHandler)
	walletRoutes.POST("/deposit", walletHandler.DepositHandler)
	walletRoutes.POST("/withdraw", walletHandler.WithdrawHandler)

	// NOTE: PlaceHold / CommitHold are intentionally not exposed. They are steps
	// inside the bidding saga owned by marketplace-service, not user actions.

	return router, closeAll, nil
}
