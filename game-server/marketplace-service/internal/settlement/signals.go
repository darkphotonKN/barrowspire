package settlement

// RetryStepSignalName wakes a parked settlement to retry its step now instead of
// waiting for the re-park timer (FS-NXP1W Req 10.2). An operator sends it from
// the Temporal UI or CLI, so the name is part of the contract: renaming it
// strands every settlement already parked waiting for the old one.
//
//	temporal workflow signal --workflow-id settlement-<listingId> --name RetryStep
const RetryStepSignalName = "RetryStep"
