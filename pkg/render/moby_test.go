package render

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/vvoland/gha-pin-diff/pkg/compare"
	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
)

// TestMobyPR52217Render simulates the full output for moby/moby#52217.
// The PR pins docker/setup-buildx-action from @v3 to @sha # v4.0.0.
// Since the same action changes in multiple files, we deduplicate in real usage,
// but the renderer handles duplicates just fine — each file gets its own entry.
func TestMobyPR52217Render(t *testing.T) {
	sha := "4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd"
	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "docker/setup-buildx-action",
				OldRef: "v3",
				NewRef: sha,
				OldTag: "v3",
				NewTag: "v4.0.0",
				File:   ".github/workflows/ci.yml",
			},
			CompareURL:   "https://github.com/docker/setup-buildx-action/compare/v3..." + sha,
			TotalCommits: 3,
			Commits: []compare.CommitInfo{
				{
					SHA:     "4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd",
					Message: "Merge pull request #123 from docker/v4",
					Author:  "crazy-max",
					Date:    time.Date(2025, 3, 20, 10, 0, 0, 0, time.UTC),
				},
				{
					SHA:     "abcdef1234567890abcdef1234567890abcdef12",
					Message: "chore: bump buildx to 0.20",
					Author:  "crazy-max",
					Date:    time.Date(2025, 3, 19, 9, 0, 0, 0, time.UTC),
				},
				{
					SHA:     "1234567890abcdef1234567890abcdef12345678",
					Message: "feat: add support for new driver options",
					Author:  "tonistiigi",
					Date:    time.Date(2025, 3, 18, 8, 0, 0, 0, time.UTC),
				},
			},
		},
	}

	got := Comment(results)

	// Print the full output so we can eyeball it.
	t.Logf("Rendered comment:\n%s", got)

	// Verify key elements.
	checks := []struct {
		desc string
		want string
	}{
		{"marker", Marker},
		{"header", "## 🔄 Action Pin Diff"},
		{"action link", "[`docker/setup-buildx-action`](https://github.com/docker/setup-buildx-action)"},
		{"version range", "`v3` → `v4.0.0`"},
		{"commit count", "**3 commits**"},
		{"compare link", fmt.Sprintf("[Compare](https://github.com/docker/setup-buildx-action/compare/v3...%s)", sha)},
		{"commit row", "| `4d04d5d` | Merge pull request #123 from docker/v4 | 2025-03-20 |"},
		{"commit row 2", "| `abcdef1` | chore: bump buildx to 0.20 | 2025-03-19 |"},
		{"commit row 3", "| `1234567` | feat: add support for new driver options | 2025-03-18 |"},
	}
	for _, c := range checks {
		if !strings.Contains(got, c.want) {
			t.Errorf("missing %s: %q", c.desc, c.want)
		}
	}
}
