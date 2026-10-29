package config

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	grpcauth "github.com/darkphotonKN/barrowspire-server/game-service/grpc/auth"
	grpccharacter "github.com/darkphotonKN/barrowspire-server/game-service/grpc/character"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/gameserver"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/handoff"
	matchqueue "github.com/darkphotonKN/barrowspire-server/game-service/internal/match_queue"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
)

// Downstreams are the gRPC addresses ("host:port") of the services game-service
// calls. They come from env, so the same binary runs natively (localhost:<port>),
// in compose, or in Kubernetes (<service>:<port>).
type Downstreams struct {
	Auth      string
	Items     string
	Character string
}

/**
* Sets up API prefix route and all routers.
*
* The returned close func waits for the matchmaker to remove this pod's
* liveness key, then releases every downstream connection; call it on
* shutdown, before redis is closed.
**/
func SetupRouter(ctx context.Context, db *sqlx.DB, addrs Downstreams, ch *amqp.Channel, redisClient redis.UniversalClient, pod Pod, outbox game.OutboxWriter) (*gin.Engine, func() error, error) {
	// gin.Default() with its access logger swapped: the default one writes the
	// raw query, and the WebSocket connect carries the bearer token in it
	router := gin.New()
	router.Use(AccessLogger(gin.DefaultWriter), gin.Recovery())

	// CORS for the game service's client surface, including the WebSocket handshake
	router.Use(GameCORS(
		commonhelpers.GetEnvString("ENVIRONMENT", "development"),
		AllowedOrigins(),
	))

	// base route
	api := router.Group("/api")

	// --- DOWNSTREAM CLIENTS ---
	authClient, err := grpcauth.NewClient(addrs.Auth)
	if err != nil {
		return nil, nil, err
	}
	itemsClient, err := grpcitems.NewClient(addrs.Items)
	if err != nil {
		return nil, nil, errors.Join(err, authClient.Close())
	}
	characterClient, err := grpccharacter.NewClient(addrs.Character)
	if err != nil {
		return nil, nil, errors.Join(err, authClient.Close(), itemsClient.Close())
	}
	conns := []io.Closer{authClient, itemsClient, characterClient}
	closeAll := func() error {
		var errs []error
		for _, c := range conns {
			errs = append(errs, c.Close())
		}
		return errors.Join(errs...)
	}

	// --- GAME SERVER SETUP ---

	// -- match maker --
	matchQueueRedis := matchqueue.NewRedis(redisClient)
	matchAnnouncer := handoff.NewRedis(redisClient)
	matchmaker := matchmaker.NewMatchmaker(2, pod.ID, matchQueueRedis, matchAnnouncer)

	// outbox is built once in main and shared with the worker that drains it
	gameService := game.NewService(db, outbox)
	// the one announcer: the matchmaker publishes create steps with it, the
	// server publishes handoff steps to the other pods. FS-K2HKP §Requirements 20.
	// the game service also settles every field visit through the same
	// match-end outbox write. FS-X2F2H §F R39, ADR-0031.
	server, err := gameserver.NewServer(ctx, authClient, matchmaker, gameService, itemsClient, characterClient, pod.ID, pod.Addr, matchAnnouncer, gameserver.WithVisitSettler(gameService))
	if err != nil {
		return nil, nil, errors.Join(fmt.Errorf("game server: %w", err), closeAll())
	}

	// -- routes --
	router.GET("/game/ws", auth.WSAuthMiddleware(authClient), server.HandleWebSocketConnection)
	// the same handler under /<pod name>/, for a path-routing ingress that sends
	// each pod's prefix to that pod and cannot rewrite the path
	if pod.Name != "" {
		router.GET("/"+pod.Name+"/game/ws", auth.WSAuthMiddleware(authClient), server.HandleWebSocketConnection)
	}

	// --- HEALTH CHECK ---
	api.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "game-service",
		})
	})

	// TODO: Add game specific routes
	// gameRoutes := api.Group("/game")
	// gameRoutes.GET("/items", gameHandler.GetItems)

	// shutdown waits for the matchmaker to delete this pod's liveness key while
	// redis is still open (FS-K2HKP §Requirements 3), bounded so a stuck redis
	// cannot hold up exit, then releases the downstream connections
	shutdown := func() error {
		select {
		case <-matchmaker.Stopped():
		case <-time.After(matchmakerStopTimeout):
			slog.Warn("matchmaker did not stop in time, pod alive key left to expire")
		}
		return closeAll()
	}

	return router, shutdown, nil
}

// a little over the matchmaker's own delete timeout
const matchmakerStopTimeout = 3 * time.Second
