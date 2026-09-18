// Package smoke proves the Temporal wiring end to end: a workflow hosted on the
// marketplace queue fans a trivial activity out to every participant queue and
// collects the replies.
//
// It exists to make the NEXT failure legible. If the first thing pointed at
// Temporal is the real settlement workflow, a failure is ambiguous across four
// layers — Temporal itself, compose networking, worker bootstrap, workflow
// code. This isolates the first three.
//
// Note how the workflow schedules by activity NAME, not by function reference.
// It cannot import items-service's activity function; nothing in marketplace
// links against it. That constraint is the whole reason ADR-0019 puts activity
// names and payload structs in shared contract packages.
package smoke

import (
	"context"
	"os"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

const (
	// WorkflowName is registered by marketplace only.
	WorkflowName = "SmokeWorkflow"

	// PingActivityName is registered by every participating service, each on
	// its own task queue.
	PingActivityName = "SmokePing"
)

type PingInput struct {
	Message string `json:"message"`
}

type PingOutput struct {
	Reply     string    `json:"reply"`
	TaskQueue string    `json:"taskQueue"`
	Hostname  string    `json:"hostname"`
	At        time.Time `json:"at"`
}

type WorkflowInput struct {
	Message string   `json:"message"`
	Queues  []string `json:"queues"`
}

type WorkflowOutput struct {
	Replies []PingOutput `json:"replies"`
}

// Ping is the activity every participant registers. Deliberately trivial: it
// reports which queue's worker picked it up and on which host.
func Ping(ctx context.Context, in PingInput) (PingOutput, error) {
	info := activity.GetInfo(ctx)
	host, _ := os.Hostname()

	activity.GetLogger(ctx).Info("smoke ping",
		"message", in.Message,
		"taskQueue", info.TaskQueue,
		"attempt", info.Attempt,
	)

	return PingOutput{
		Reply:     "pong: " + in.Message,
		TaskQueue: info.TaskQueue,
		Hostname:  host,
		At:        time.Now().UTC(),
	}, nil
}

// Workflow schedules Ping onto each queue in turn. One successful reply per
// queue proves that queue's worker is polling and that payload round-trips.
func Workflow(ctx workflow.Context, in WorkflowInput) (WorkflowOutput, error) {
	log := workflow.GetLogger(ctx)
	log.Info("smoke workflow starting", "queues", in.Queues)

	out := WorkflowOutput{Replies: make([]PingOutput, 0, len(in.Queues))}

	for _, queue := range in.Queues {
		actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			// Routing is per-activity. This is the mechanism the whole
			// architecture rests on: the workflow decides which fleet runs
			// each step.
			TaskQueue: queue,

			// Every activity needs this. One without it is a hang waiting to
			// happen — Temporal has no other way to notice a dead worker that
			// is not heartbeating.
			StartToCloseTimeout: 10 * time.Second,
		})

		var reply PingOutput
		if err := workflow.ExecuteActivity(actCtx, PingActivityName, PingInput{
			Message: in.Message,
		}).Get(actCtx, &reply); err != nil {
			log.Error("smoke ping failed", "queue", queue, "error", err)
			return out, err
		}

		log.Info("smoke ping ok", "queue", queue, "host", reply.Hostname)
		out.Replies = append(out.Replies, reply)
	}

	return out, nil
}

// RegisterWorkflow is used by the workflow host (marketplace) only.
func RegisterWorkflow(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}

// RegisterActivity is used by every participating service.
func RegisterActivity(w worker.Worker) {
	w.RegisterActivityWithOptions(Ping, activity.RegisterOptions{Name: PingActivityName})
}
