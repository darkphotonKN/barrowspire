package repository

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/stretchr/testify/require"
)

// The domain's status strings are written to listings.status verbatim — the
// repository hands the snapshot's status straight to the INSERT/UPDATE. So a
// constant the CHECK does not admit is not a naming slip, it is a write that
// fails in production the first time that transition is taken. This pins the two
// together without needing a database: it reads the CHECK out of the migrations
// and fails if the domain can produce a value it rejects.
//
// It caught StatusCancelled shipping as "WITHDRAW" and StatusExpired as
// "STATUS_EXPIRED" against a CHECK admitting only CANCELLED and EXPIRED.
func TestListingStatusConstantsAreAdmittedByTheCheckConstraint(t *testing.T) {
	admitted := listingStatusCheckValues(t)

	// every status the domain can assign, including the ones only settlement
	// reaches
	for _, s := range []listing.ListingStatus{
		listing.StatusListed,
		listing.StatusCancelled,
		listing.StatusPendingSettlement,
		listing.StatusExpired,
		listing.StatusSold,
	} {
		require.Containsf(t, admitted, string(s),
			"listings.status CHECK admits %v, so writing %q fails; add a migration or fix the constant",
			admitted, s)
	}
}

var statusCheckRE = regexp.MustCompile(`(?is)status\s+IN\s*\(([^)]*)\)`)

// listingStatusCheckValues returns the values admitted by the CHECK in force:
// the last migration that defines one wins, so a later ALTER that widens or
// renames the set is what gets compared.
func listingStatusCheckValues(t *testing.T) []string {
	t.Helper()

	files, err := filepath.Glob(filepath.Join("..", "..", "..", "migrations", "*.up.sql"))
	require.NoError(t, err)
	require.NotEmpty(t, files, "no up migrations found")
	sort.Strings(files)

	var values []string
	for _, f := range files {
		body, err := os.ReadFile(f)
		require.NoError(t, err)

		// bids carries a status CHECK of its own and a foreign key naming
		// listings, so the file is not a fine enough filter — go statement by
		// statement and keep the ones that are about listings and not bids
		for _, stmt := range strings.Split(string(body), ";") {
			lower := strings.ToLower(stmt)
			if !strings.Contains(lower, "listings") || strings.Contains(lower, "bids") {
				continue
			}

			if m := statusCheckRE.FindStringSubmatch(stmt); m != nil {
				values = nil
				for _, v := range strings.Split(m[1], ",") {
					values = append(values, strings.Trim(strings.TrimSpace(v), "'"))
				}
			}
		}
	}

	require.NotEmpty(t, values, "no listings.status CHECK found in the migrations")
	return values
}
