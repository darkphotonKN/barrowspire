package commonhelpers

import (
	"os"
)

func GetEnvString(key, fallback string) string {
	env := os.Getenv(key)

	if env == "" {
		return fallback
	}

	return env
}
