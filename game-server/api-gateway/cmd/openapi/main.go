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
	"github.com/gin-gonic/gin"
)

func main() {
	gin.SetMode(gin.ReleaseMode)

	api := contract.New(gin.New())
	contract.RegisterOperations(api)

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
