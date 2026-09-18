// Command temporal-smoke starts the smoke workflow and prints what came back.
//
// Run it from the host once all four service workers are up:
//
//	TEMPORAL_HOST_PORT=localhost:7233 go run ./cmd/temporal-smoke
//
// Then open http://localhost:8233 and read the event history for the run ID it
// prints. That history is the thing worth looking at — WorkflowExecutionStarted,
// then a scheduled/started/completed triple per activity, then
// WorkflowExecutionCompleted.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/common/temporal/smoke"

	"go.temporal.io/sdk/client"
)

func main() {
	message := flag.String("message", "barrowspire", "message to round-trip")
	timeout := flag.Duration("timeout", 2*time.Minute, "how long to wait for the run")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	// The queue passed here is only used for config shape; this process hosts
	// no worker.
	cfg, err := bstemporal.LoadConfig(bstemporal.QueueMarketplace)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	c, err := bstemporal.Dial(ctx, cfg, nil)
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer c.Close()

	run, err := c.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:                       fmt.Sprintf("smoke-%d", time.Now().UnixNano()),
		TaskQueue:                bstemporal.QueueMarketplace.String(),
		WorkflowExecutionTimeout: *timeout,
	}, smoke.WorkflowName, smoke.WorkflowInput{
		Message: *message,
		Queues: []string{
			bstemporal.QueueMarketplace.String(),
			bstemporal.QueueItems.String(),
			bstemporal.QueueWallet.String(),
			bstemporal.QueueLedger.String(),
		},
	})
	if err != nil {
		log.Fatalf("start: %v", err)
	}

	fmt.Printf("workflow %s (run %s)\n", run.GetID(), run.GetRunID())
	fmt.Printf("history: http://localhost:8233/namespaces/%s/workflows/%s/%s\n\n",
		cfg.Namespace, run.GetID(), run.GetRunID())

	var out smoke.WorkflowOutput
	if err := run.Get(ctx, &out); err != nil {
		fmt.Fprintf(os.Stderr, "\nFAILED: %v\n", err)
		fmt.Fprintf(os.Stderr, "If one queue never answered, that service's worker is not polling.\n")
		os.Exit(1)
	}

	for _, r := range out.Replies {
		fmt.Printf("  %-12s  %s  (host %s)\n", r.TaskQueue, r.Reply, r.Hostname)
	}
	fmt.Printf("\nall %d queues answered\n", len(out.Replies))
}
