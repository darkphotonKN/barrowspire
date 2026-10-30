package levelgen

import (
	"errors"
	"flag"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

var update = flag.Bool("update", false, "rewrite testdata golden files")

func TestPackage_ImportsOnlyStandardLibrary(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	fset := token.NewFileSet()
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		src, err := os.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		f, err := parser.ParseFile(fset, name, src, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		for _, imp := range f.Imports {
			path, _ := strconv.Unquote(imp.Path.Value)
			// Standard library paths have no dot in their first element.
			if first, _, _ := strings.Cut(path, "/"); strings.Contains(first, ".") {
				t.Errorf("%s imports %q, want standard library only", name, path)
			}
		}
	}
}

func TestGenerate_SameSeed_ReturnsIdenticalLayout(t *testing.T) {
	for seed := uint64(0); seed < 20; seed++ {
		a, err := Generate(ForestParams, seed)
		if err != nil {
			t.Fatalf("seed %d: Generate() error = %v", seed, err)
		}
		b, err := Generate(ForestParams, seed)
		if err != nil {
			t.Fatalf("seed %d: second Generate() error = %v", seed, err)
		}
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("seed %d: layouts differ between two calls", seed)
		}
		if a.Seed != seed {
			t.Fatalf("seed %d: layout.Seed = %d", seed, a.Seed)
		}
	}
}

func TestGenerate_ConsecutiveSeeds_ReturnDifferentLayouts(t *testing.T) {
	const seeds = 10
	var distinct []Layout
	for seed := uint64(100); seed < 100+seeds; seed++ {
		l, err := Generate(ForestParams, seed)
		if err != nil {
			t.Fatalf("seed %d: Generate() error = %v", seed, err)
		}
		l.Seed, l.Attempt = 0, 0 // compare shapes, not provenance
		seen := false
		for _, d := range distinct {
			if reflect.DeepEqual(d, l) {
				seen = true
				break
			}
		}
		if !seen {
			distinct = append(distinct, l)
		}
	}
	if len(distinct) < 2 {
		t.Fatalf("%d seeds gave %d distinct layouts, want at least 2", seeds, len(distinct))
	}
}

func TestGenerate_ForestParams_EverySeedValid(t *testing.T) {
	const seeds = 1000
	maxWalls, retried := 0, 0
	cells := float64(ForestParams.Cols * ForestParams.Rows)
	openShare := 0.0
	for seed := uint64(0); seed < seeds; seed++ {
		l, err := Generate(ForestParams, seed)
		if err != nil {
			t.Fatalf("seed %d: Generate() error = %v", seed, err)
		}
		if err := validate(ForestParams, l); err != nil {
			t.Fatalf("seed %d: %v\n%s", seed, err, renderASCII(ForestParams, l))
		}
		maxWalls = max(maxWalls, len(l.Walls))
		if l.Attempt > 0 {
			retried++
		}
		openShare += float64(len(l.Open)) / cells
	}
	// The mean open share shows review the forest has not gone open country
	// (FS-KSD6K R5).
	t.Logf("%d seeds: max %d wall rects (budget %d), %d needed a retry, mean open share %.1f%%",
		seeds, maxWalls, ForestParams.WallBudget, retried, 100*openShare/seeds)
}

func TestGenerate_FirstAttemptFails_RetriesDeterministically(t *testing.T) {
	// Find a seed whose first attempt breaks a rule, then show Generate
	// recovers from a derived seed, the same way every time.
	for seed := uint64(0); seed < 100; seed++ {
		first := newBuilder(ForestParams, attemptSeed(seed, 0)).build()
		if validate(ForestParams, first) == nil {
			continue
		}

		a, err := Generate(ForestParams, seed)
		if err != nil {
			t.Fatalf("seed %d: Generate() error = %v", seed, err)
		}
		if a.Attempt == 0 {
			t.Fatalf("seed %d: first attempt is invalid but Attempt = 0", seed)
		}
		if err := validate(ForestParams, a); err != nil {
			t.Fatalf("seed %d: retried layout invalid: %v", seed, err)
		}
		b, _ := Generate(ForestParams, seed)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("seed %d: retried layouts differ between two calls", seed)
		}
		return
	}
	t.Fatal("no seed in 0..99 failed its first attempt; pick parameters that force one")
}

func TestGenerate_EveryAttemptFails_ReturnsErrNoLayout(t *testing.T) {
	p := ForestParams
	p.Cols, p.Rows = 10, 10 // far too small for five branches
	p.Branches = IntRange{Min: 5, Max: 5}
	p.RetryLimit = 3

	_, err := Generate(p, 7)

	if !errors.Is(err, ErrNoLayout) {
		t.Fatalf("Generate() error = %v, want ErrNoLayout", err)
	}
}

func TestGenerate_GoldenASCII(t *testing.T) {
	const seed = 20261029
	l, err := Generate(ForestParams, seed)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	got := renderASCII(ForestParams, l)
	path := filepath.Join("testdata", "forest-20261029.golden")

	if *update {
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden (run with -update to create it): %v", err)
	}
	if got != string(want) {
		t.Fatalf("layout for seed %d changed (run with -update if intended)\ngot:\n%s\nwant:\n%s",
			seed, got, want)
	}
}
