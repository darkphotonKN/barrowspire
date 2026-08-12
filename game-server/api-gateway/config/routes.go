package config

import (
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	authService "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/example"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/notification"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/payment"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/stats"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

/**
* Sets up API prefix route and all routers.
**/
func SetupRouter(registry discovery.Registry, ch *amqp.Channel) *gin.Engine {
	// gin.New(), not gin.Default(): Default() installs gin's stock Recovery,
	// which writes a 500 with an EMPTY BODY and so is the one failure path that
	// bypasses the error contract (FS-0001 §Edge States). Default() also installs
	// gin.Logger(), which is re-attached below — dropping it silently was the
	// second half of this trap.
	router := gin.New()

	// --- Middlewares ---

	// Recovery FIRST. Middleware registered before it panics outside its scope,
	// and a panic in CORS or tracing would produce the empty 500 all over again.
	router.Use(httperr.Recovery())

	router.Use(gin.Logger())

	// NOTE: debugging middleware
	router.Use(func(c *gin.Context) {
		fmt.Println("Incoming request to:", c.Request.Method, c.Request.URL.Path, "from", c.Request.Host)
		c.Next()
	})

	// TODO: CORS for development, remove in PROD
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	router.Use(otelgin.Middleware("api-gateway"))

	// base route
	api := router.Group("/api")

	/***************
	* MICROSERVICES
	***************/

	// --- EXAMPLE MICROSERVICE ---

	exampleClient := example.NewClient(registry)
	exampleHandler := example.NewHandler(exampleClient)

	exampleRoutes := api.Group("/example")
	exampleRoutes.GET("/:id", exampleHandler.GetExample)
	exampleRoutes.POST("", exampleHandler.CreateExample)

	// --- AUTH & MEMBERS MICROSERVICE ---

	// -- Member Setup (gRPC - for private routes) --
	authClient := authService.NewClient(registry)
	authHandler := authService.NewHandler(authClient)

	// Member Setup amqp
	amqpAuthClient := authService.NewAmqpAuthClient(ch)

	// Member routes are SERIALIZED (FS-0002 slice 1). All eight are declared as
	// typed operations in internal/gateway/auth/typed.go and mounted below via
	// contract.RegisterOperations, so openapi.yaml describes them and the docs
	// UI serves them.
	//
	// Their JWT middleware is attached per-operation rather than to a gin group:
	// Huma registers on the engine, so a group middleware would never run for
	// them. See contract.Protected.

	// --- STATS MICROSERVICE ---

	statsClient := stats.NewClient(registry)
	statsHandler := stats.NewHandler(statsClient)

	statsRoutes := api.Group("/stats")
	statsRoutes.GET("/player/:playerId", statsHandler.GetPlayerStats)
	statsRoutes.GET("/leaderboard", statsHandler.GetLeaderboard)

	// --- GAME SERVICE ---
	// TODO: Add game service routes when implemented
	// gameClient := game.NewClient(registry)
	// gameHandler := game.NewHandler(gameClient)
	// gameRoutes := api.Group("/game")
	// gameRoutes.GET("/items", gameHandler.GetItemsHandler)

	// --- NOTIFICATION MICROSERVICE ---

	notificationClient := notification.NewClient(registry)
	notificationHandler := notification.NewHandler(notificationClient)
	notificationRoutes := api.Group("/notification")
	notificationRoutes.Use(auth.AuthMiddleware())
	notificationRoutes.GET("/", notificationHandler.GetNotificationsByUserIDHandler)
	notificationRoutes.PATCH("/:id/read", notificationHandler.MarkNotificationAsReadHandler)
	notificationRoutes.PATCH("/read-all", notificationHandler.MarkAllNotificationsAsReadHandler)
	// --- PAYMENT MICROSERVICE ---

	paymentClient := payment.NewClient(registry)
	paymentHandler := payment.NewHandler(paymentClient)

	paymentRoutes := api.Group("/payment")
	paymentRoutes.Use(auth.AuthMiddleware())
	paymentRoutes.POST("/customer", paymentHandler.CreateCustomerHandler)
	paymentRoutes.POST("/subscription/setup", paymentHandler.SetupSubscriptionHandler)
	paymentRoutes.POST("/subscribe", paymentHandler.SubscribeHandler)
	paymentRoutes.GET("/subscriptions/:customerId", paymentHandler.GetUserSubscriptionsHandler)
	paymentRoutes.GET("/subscription/permission", paymentHandler.CheckPermissionHandler)

	// Stripe Webhook (no auth - Stripe sends POST directly)
	router.POST("/webhook/stripe", paymentHandler.WebhookHandler)

	// --- ITEMS MICROSERVICE ---

	itemClient := item.NewClient(registry)
	itemHandler := item.NewHandler(itemClient)

	itemRoutes := api.Group("/items")
	// Private Routes - require authentication
	itemRoutes.Use(auth.AuthMiddleware())

	// --- Legacy/Advanced APIs (creates weapon/armor/consumable separately) ---
	itemRoutes.POST("/weapon", itemHandler.CreateWeaponHandler)
	itemRoutes.POST("/template", itemHandler.CreateItemTemplateHandler) // Creates template only (sends notification)

	// Complete item operations (creates both specific item + template, sends notification)
	itemRoutes.POST("/complete-weapon", itemHandler.CreateCompleteWeaponHandler)
	itemRoutes.POST("/complete-armor", itemHandler.CreateCompleteArmorHandler)
	itemRoutes.POST("/complete-consumable", itemHandler.CreateCompleteConsumableHandler)

	// --- Query APIs ---
	itemRoutes.GET("/weapons", itemHandler.ListWeaponsWithTemplateHandler)

	// --- Dropdown Options (for frontend forms) ---
	itemRoutes.GET("/types", itemHandler.ListItemTypesHandler)
	itemRoutes.GET("/rarities", itemHandler.ListItemRaritiesHandler)

	itemRoutes.GET("/loadout", itemHandler.GetLoadoutHandler)
	itemRoutes.PUT("/loadout", itemHandler.UpdateLoadoutHandler)
	itemRoutes.GET("/instances", itemHandler.ListItemInstancesHandler)

	// --- SERIALIZED CONTRACT (FS-0002) ---
	//
	// Mounted after every legacy route so it is obvious that Huma is added to
	// this router rather than replacing it. Groups join RegisterOperations one
	// slice at a time; everything not yet listed there is still legacy gin above.
	contract.RegisterOperations(contract.New(router), contract.Deps{
		Auth:           authHandler,
		AuthAMQP:       amqpAuthClient,
		AuthMiddleware: auth.AuthMiddleware(),
	})

	// An unrouted path is the one 4xx gin answers on its own — no handler runs, so
	// the seam never sees it, and the client gets a bare text/plain 404 with no
	// `code`. Registered last because NoRoute is the fallback for everything above.
	router.NoRoute(httperr.NotFoundHandler())

	return router
}
