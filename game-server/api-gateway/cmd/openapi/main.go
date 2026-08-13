// Command openapi prints the derived OpenAPI document to stdout.
//
// `make openapi` redirects it into openapi.yaml, and CI regenerates and fails on
// any diff — so this command is the only thing that may author that file.
//
// It builds the API through the SAME registration path the server uses
// (contract.RegisterOperations), because a generator with its own route list is
// a second source of truth that drifts from the first. Nothing here dials a
// downstream service: registration records an operation's types and metadata, it
// never invokes a handler.
package main

import (
	"fmt"
	"os"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	authgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	itemgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	notifgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/notification"
	paygw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/payment"
	statsgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/stats"
	"github.com/gin-gonic/gin"
)

func main() {
	gin.SetMode(gin.ReleaseMode)

	// Nil downstream clients: registration never invokes a handler.
	api := contract.New(gin.New())
	contract.RegisterOperations(api, contract.Deps{
		Auth:         authgw.NewHandler(nil),
		AuthAMQP:     authgw.NewAmqpAuthClient(nil),
		Items:        itemgw.NewHandler(nil),
		Notification: notifgw.NewHandler(nil),
		Stats:        statsgw.NewHandler(nil),
		Payment:      paygw.NewHandler(nil),
	})

	spec, err := api.OpenAPI().YAML()
	if err != nil {
		fmt.Fprintf(os.Stderr, "generating openapi: %v\n", err)
		os.Exit(1)
	}

	if _, err := os.Stdout.Write(spec); err != nil {
		fmt.Fprintf(os.Stderr, "writing openapi: %v\n", err)
		os.Exit(1)
	}
}
