package diffparser

import (
	"testing"
)

// TestMobyPR52217 tests parsing the real diff from moby/moby#52217
// which pins docker/setup-buildx-action from tag @v3 to SHA @4d04d5d... # v4.0.0
// across many workflow files.
func TestMobyPR52217(t *testing.T) {
	sha := "4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd"
	patches := map[string]string{
		".github/workflows/.test-unit.yml": "@@ -51,7 +51,7 @@ jobs:\n" +
			"       -\n" +
			"         name: Set up Docker Buildx\n" +
			"-        uses: docker/setup-buildx-action@v3\n" +
			"+        uses: docker/setup-buildx-action@" + sha + " # v4.0.0\n" +
			"         with:",
		".github/workflows/.test.yml": "@@ -48,7 +48,7 @@ jobs:\n" +
			"       -\n" +
			"         name: Set up Docker Buildx\n" +
			"-        uses: docker/setup-buildx-action@v3\n" +
			"+        uses: docker/setup-buildx-action@" + sha + " # v4.0.0\n" +
			"         with:",
		".github/workflows/ci.yml": "@@ -45,7 +45,7 @@ jobs:\n" +
			"       -\n" +
			"         name: Set up Docker Buildx\n" +
			"-        uses: docker/setup-buildx-action@v3\n" +
			"+        uses: docker/setup-buildx-action@" + sha + " # v4.0.0\n" +
			"         with:",
	}

	got := Parse(patches)
	if len(got) != 3 {
		t.Fatalf("expected 3 results (one per file), got %d: %+v", len(got), got)
	}

	for _, u := range got {
		if u.Action != "docker/setup-buildx-action" {
			t.Errorf("Action = %q, want docker/setup-buildx-action", u.Action)
		}
		if u.OldRef != "v3" {
			t.Errorf("OldRef = %q, want v3", u.OldRef)
		}
		if u.NewRef != sha {
			t.Errorf("NewRef = %q, want %s", u.NewRef, sha)
		}
		if u.OldTag != "v3" {
			t.Errorf("OldTag = %q, want v3", u.OldTag)
		}
		if u.NewTag != "v4.0.0" {
			t.Errorf("NewTag = %q, want v4.0.0", u.NewTag)
		}
	}
}
