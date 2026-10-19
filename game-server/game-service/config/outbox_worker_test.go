package config

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestOutboxWorkerSettings_GameService_FiveSecondCycleBatchTwenty(t *testing.T) {
	got := OutboxWorkerSettings()

	assert.Equal(t, 5*time.Second, got.Cycle)
	assert.Equal(t, 20, got.Batch)
}
