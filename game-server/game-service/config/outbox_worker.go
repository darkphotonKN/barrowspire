package config

import "time"

// OutboxWorkerConfig is how often game-service drains its outbox and how many
// rows it publishes per tick.
type OutboxWorkerConfig struct {
	Cycle time.Duration
	Batch int
}

// OutboxWorkerSettings returns game-service's outbox worker settings. The 5s
// cycle keeps match results arriving within a few seconds of a run ending;
// the batch bounds how much of a backlog one tick loads.
func OutboxWorkerSettings() OutboxWorkerConfig {
	return OutboxWorkerConfig{
		Cycle: 5 * time.Second,
		Batch: 20,
	}
}
