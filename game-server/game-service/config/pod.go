package config

import (
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
)

// Pod is this replica's identity: who it is to the rest of the fleet, and
// where a client must connect to reach it specifically. Fixed for the life of
// the process. FS-K2HKP §Requirements 1, FS-JEAVX §Requirements 4.
type Pod struct {
	ID   string
	Addr string

	// Generated reports that POD_ID was unset and ID was made up at startup.
	Generated bool
}

/**
* Reads the pod identity from env, filling in local dev defaults.
*
* gamePort is the listen address (":5668"), so the default POD_ADDR follows
* GAME_PORT: a second local replica on another port gets an address that
* reaches it, not the first one.
**/
func LoadPod(gamePort string) Pod {
	pod := Pod{
		ID:   commonhelpers.GetEnvString("POD_ID", ""),
		Addr: commonhelpers.GetEnvString("POD_ADDR", "ws://localhost"+gamePort+"/game/ws"),
	}

	if pod.ID == "" {
		pod.ID = uuid.NewString()
		pod.Generated = true
	}

	return pod
}
