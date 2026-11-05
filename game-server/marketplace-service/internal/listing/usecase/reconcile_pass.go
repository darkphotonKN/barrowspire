package usecase

import "time"

// reconcilePassTimeout bounds one reconcile pass, every page and every call in
// it: the stale-reservation pass, the confirmed-reservation backstop and the hold
// reconciler each run under it (FS-9BJCP Req 13). It sits well inside their
// 5-minute ticks, so a peer that hangs or keeps answering new pages ends the pass
// before the next one is due. Rows not reached are read again next tick.
const reconcilePassTimeout = 2 * time.Minute
