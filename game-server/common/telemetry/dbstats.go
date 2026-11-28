package telemetry

import (
	"database/sql"
	"log/slog"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

// RegisterDBStats exports a pool's database/sql stats on the default registry
// as go_sql_*{db_name=dbName}: open, in-use and idle connections, waits for a
// free connection, and connections closed by the idle, idle-time and lifetime
// limits. The values are read from db.Stats() at scrape time.
//
// sqlx callers pass db.DB. A failed registration (the same db_name twice) is
// logged, not fatal: losing metrics must not take down the service.
func RegisterDBStats(db *sql.DB, dbName string) {
	if err := prometheus.Register(collectors.NewDBStatsCollector(db, dbName)); err != nil {
		slog.Warn("db stats collector not registered", "db_name", dbName, "err", err)
	}
}
