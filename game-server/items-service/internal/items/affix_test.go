package items

import "testing"

// item_instances.affixes is NOT NULL with an array CHECK, so the column must
// always receive a JSON array (FS-4R9M9 R48).
func TestAffixes_Value_AlwaysAnArray(t *testing.T) {
	tests := []struct {
		name string
		in   Affixes
		want string
	}{
		{"nil is the empty array", nil, `[]`},
		{"empty is the empty array", Affixes{}, `[]`},
		{"entries keep stat, tier and value", Affixes{{Stat: "strength", Tier: 2, Value: 3}}, `[{"stat":"strength","tier":2,"value":3}]`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, err := tt.in.Value()
			if err != nil {
				t.Fatalf("value: %v", err)
			}
			if got, _ := v.(string); got != tt.want {
				t.Errorf("Value = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestAffixes_Scan(t *testing.T) {
	tests := []struct {
		name    string
		src     any
		want    Affixes
		wantErr bool
	}{
		{"jsonb bytes", []byte(`[{"stat":"defense","tier":1,"value":2},{"stat":"max_mana","tier":0,"value":9}]`),
			Affixes{{Stat: "defense", Tier: 1, Value: 2}, {Stat: "max_mana", Tier: 0, Value: 9}}, false},
		{"text", `[]`, Affixes{}, false},
		{"NULL reads as no affixes", nil, Affixes{}, false},
		{"not json", []byte(`{oops`), nil, true},
		{"unsupported type", 42, nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got Affixes
			err := got.Scan(tt.src)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("scan: %v", err)
			}
			if got == nil || len(got) != len(tt.want) {
				t.Fatalf("Scan = %#v, want %#v", got, tt.want)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %+v, want %+v", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// unique_items.fixed_affixes arrives through a LEFT JOIN, so a non-unique
// template scans NULL (FS-4R9M9 R6).
func TestAffixRanges_Scan(t *testing.T) {
	tests := []struct {
		name string
		src  any
		want AffixRanges
	}{
		{"NULL is no ranges", nil, nil},
		{"bytes", []byte(`[{"stat":"agility","min":2,"max":4}]`), AffixRanges{{Stat: "agility", Min: 2, Max: 4}}},
		{"text", `[{"stat":"max_health","min":10,"max":16},{"stat":"strength","min":2,"max":3}]`,
			AffixRanges{{Stat: "max_health", Min: 10, Max: 16}, {Stat: "strength", Min: 2, Max: 3}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got AffixRanges
			if err := got.Scan(tt.src); err != nil {
				t.Fatalf("scan: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("Scan = %+v, want %+v", got, tt.want)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("range[%d] = %+v, want %+v", i, got[i], tt.want[i])
				}
			}
		})
	}

	var bad AffixRanges
	if err := bad.Scan(42); err == nil {
		t.Error("an unsupported source type must be an error")
	}
}
