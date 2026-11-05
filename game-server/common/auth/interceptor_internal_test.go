package auth

import "testing"

// A method on both lists is a programming error: publicMethods would win and the
// optional identity would silently never be read (FS-GKHYD Edge States).
func TestMethodLists_AreDisjoint(t *testing.T) {
	for method := range optionalAuthMethods {
		if publicMethods[method] {
			t.Errorf("%s is on both publicMethods and optionalAuthMethods", method)
		}
	}
}

// The optional-auth list is exactly the two Bazaar reads (ADR-0053); widening it
// is a decision, not a drive-by.
func TestOptionalAuthMethods_AreExactlyTheBazaarReads(t *testing.T) {
	want := map[string]bool{
		"/marketplace.MarketplaceService/BrowseListings": true,
		"/marketplace.MarketplaceService/GetListing":     true,
	}
	if len(optionalAuthMethods) != len(want) {
		t.Fatalf("optionalAuthMethods has %d entries, want %d: %v", len(optionalAuthMethods), len(want), optionalAuthMethods)
	}
	for method := range want {
		if !optionalAuthMethods[method] {
			t.Errorf("optionalAuthMethods is missing %s", method)
		}
	}
}
