package render

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/vvoland/gha-pin-diff/pkg/compare"
	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
)

func TestCommentEmpty(t *testing.T) {
	got := Comment(nil)
	if got != "" {
		t.Errorf("expected empty string for nil results, got %q", got)
	}
}

func TestCommentMarker(t *testing.T) {
	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				OldTag: "v4.0.0",
				NewTag: "v4.1.0",
				File:   ".github/workflows/ci.yml",
			},
			CompareURL:   "https://github.com/actions/checkout/compare/aaa...bbb",
			TotalCommits: 1,
			Commits: []compare.CommitInfo{
				{
					SHA:     "abc1234567890abc1234567890abc1234567890ab",
					Message: "Fix something",
					Author:  "alice",
					Date:    time.Date(2024, 4, 15, 0, 0, 0, 0, time.UTC),
				},
			},
		},
	}

	got := Comment(results)

	if !strings.HasPrefix(got, Marker) {
		t.Error("comment should start with marker")
	}
	if !strings.Contains(got, "## 🔄 Action Pin Diff") {
		t.Error("missing header")
	}
	if !strings.Contains(got, "`v4.0.0` → `v4.1.0`") {
		t.Error("missing version range")
	}
	if !strings.Contains(got, "**1 commit**") {
		t.Error("should say '1 commit' (singular)")
	}
	if !strings.Contains(got, "| [`abc1234`](https://github.com/actions/checkout/commit/abc1234567890abc1234567890abc1234567890ab) | Fix something | 2024-04-15 |") {
		t.Errorf("missing commit row, got:\n%s", got)
	}
}

func TestCommentError(t *testing.T) {
	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				File:   ".github/workflows/ci.yml",
			},
			Err: fmt.Errorf("404 not found"),
		},
	}

	got := Comment(results)
	if !strings.Contains(got, "⚠️ Could not fetch comparison") {
		t.Error("missing error message")
	}
	if !strings.Contains(got, "View diff manually") {
		t.Error("missing manual diff link")
	}
}

func TestCommentTruncation(t *testing.T) {
	commits := make([]compare.CommitInfo, 20)
	for i := range commits {
		commits[i] = compare.CommitInfo{
			SHA:     fmt.Sprintf("abc%04d567890abc1234567890abc1234567890ab", i),
			Message: fmt.Sprintf("Commit %d", i),
			Author:  "dev",
			Date:    time.Date(2024, 4, 15, 0, 0, 0, 0, time.UTC),
		}
	}

	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				OldTag: "v4.0.0",
				NewTag: "v4.1.0",
				File:   ".github/workflows/ci.yml",
			},
			CompareURL:   "https://github.com/actions/checkout/compare/aaa...bbb",
			TotalCommits: 20,
			Commits:      commits,
		},
	}

	got := Comment(results)

	if !strings.Contains(got, fmt.Sprintf("Showing %d of 20 commits", MaxCommitsShown)) {
		t.Errorf("missing truncation notice, got:\n%s", got)
	}

	// Count table rows (lines starting with "| [`")
	rows := 0
	for _, line := range strings.Split(got, "\n") {
		if strings.HasPrefix(line, "| [`") {
			rows++
		}
	}
	if rows != MaxCommitsShown {
		t.Errorf("expected %d commit rows, got %d", MaxCommitsShown, rows)
	}
}

func TestCommentSortOrder(t *testing.T) {
	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "zzz/last",
				OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				File:   ".github/workflows/z.yml",
			},
			TotalCommits: 0,
		},
		{
			Update: diffparser.ActionUpdate{
				Action: "aaa/first",
				OldRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				File:   ".github/workflows/a.yml",
			},
			TotalCommits: 0,
		},
	}

	got := Comment(results)
	idxFirst := strings.Index(got, "aaa/first")
	idxLast := strings.Index(got, "zzz/last")
	if idxFirst > idxLast {
		t.Error("results should be sorted by action name")
	}
}

func TestCommentDedup(t *testing.T) {
	// Simulate a PR that pins actions/checkout@v6 → SHA in 5 different places.
	base := compare.Result{
		Update: diffparser.ActionUpdate{
			Action: "actions/checkout",
			OldRef: "v6",
			NewRef: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
			OldTag: "v6",
			NewTag: "v6",
		},
		CompareURL:   "https://github.com/actions/checkout/compare/v6...de0fac2e4500dabe0009e67214ff5f5447ce83dd",
		TotalCommits: 0,
	}

	var results []compare.Result
	for _, f := range []string{"ci.yml", "build.yml", "test.yml", "release.yml", "lint.yml"} {
		r := base
		r.Update.File = ".github/workflows/" + f
		results = append(results, r)
	}

	got := Comment(results)

	// Should appear once in pin-only table, not as repeated full sections.
	count := strings.Count(got, "[`actions/checkout`]")
	if count != 1 {
		t.Errorf("expected actions/checkout mentioned once, got %d times\n%s", count, got)
	}
	if !strings.Contains(got, "📌 Pinned") {
		t.Errorf("expected pin-only section\n%s", got)
	}
}

func TestCommentDedupDifferentRefs(t *testing.T) {
	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "v5",
				NewRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				OldTag: "v5",
				NewTag: "v6",
				File:   ".github/workflows/ci.yml",
			},
			TotalCommits: 3,
		},
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "v6",
				NewRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				OldTag: "v6",
				NewTag: "v6",
				File:   ".github/workflows/ci.yml",
			},
			TotalCommits: 0,
		},
	}

	got := Comment(results)

	// The v5→v6 change should render as a full section.
	if !strings.Contains(got, "`v5` → `v6`") {
		t.Errorf("missing version change section\n%s", got)
	}
	// The v6→v6 pin should appear in the pin-only table.
	if !strings.Contains(got, "📌 Pinned") {
		t.Errorf("missing pin-only section\n%s", got)
	}
}

func TestCommentPinOnly(t *testing.T) {
	results := []compare.Result{
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "v6",
				NewRef: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
				OldTag: "v6",
				NewTag: "v6",
				File:   ".github/workflows/ci.yml",
			},
			CompareURL:   "https://github.com/actions/checkout/compare/v6...de0fac2e4500dabe0009e67214ff5f5447ce83dd",
			TotalCommits: 0,
		},
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/setup-go",
				OldRef: "v6",
				NewRef: "4b73464bb391d4059bd26b0524d20df3927bd417",
				OldTag: "v6",
				NewTag: "v6",
				File:   ".github/workflows/ci.yml",
			},
			CompareURL:   "https://github.com/actions/setup-go/compare/v6...4b73464bb391d4059bd26b0524d20df3927bd417",
			TotalCommits: 0,
		},
		{
			Update: diffparser.ActionUpdate{
				Action: "actions/upload-artifact",
				OldRef: "v7",
				NewRef: "bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
				OldTag: "v7",
				NewTag: "v7",
				File:   ".github/workflows/ci.yml",
			},
			CompareURL:   "https://github.com/actions/upload-artifact/compare/v7...bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
			TotalCommits: 0,
		},
	}

	got := Comment(results)
	t.Logf("Rendered:\n%s", got)

	if !strings.Contains(got, "📌 Pinned (digest unchanged)") {
		t.Error("missing pin-only header")
	}

	// All actions should appear exactly once in the table.
	for _, action := range []string{"actions/checkout", "actions/setup-go", "actions/upload-artifact"} {
		count := strings.Count(got, "[`"+action+"`]")
		if count != 1 {
			t.Errorf("%s should appear once, got %d", action, count)
		}
	}

	// Should NOT contain full section headers for pin-only results.
	if strings.Contains(got, "**0 commits**") {
		t.Error("pin-only results should not show commit count")
	}
}

func TestCommentPinOnlyAllSameAction(t *testing.T) {
	// The exact scenario from the issue: same action pinned across many files.
	var results []compare.Result
	for i := range 5 {
		results = append(results, compare.Result{
			Update: diffparser.ActionUpdate{
				Action: "actions/checkout",
				OldRef: "v6",
				NewRef: "de0fac2e4500dabe0009e67214ff5f5447ce83dd",
				OldTag: "v6",
				NewTag: "v6",
				File:   fmt.Sprintf(".github/workflows/file%d.yml", i),
			},
			TotalCommits: 0,
		})
	}
	for i := range 4 {
		results = append(results, compare.Result{
			Update: diffparser.ActionUpdate{
				Action: "actions/setup-go",
				OldRef: "v6",
				NewRef: "4b73464bb391d4059bd26b0524d20df3927bd417",
				OldTag: "v6",
				NewTag: "v6",
				File:   fmt.Sprintf(".github/workflows/file%d.yml", i),
			},
			TotalCommits: 0,
		})
	}

	got := Comment(results)
	t.Logf("Rendered:\n%s", got)

	// Should be a single compact table with 2 rows, not 9 sections.
	if strings.Count(got, "[`actions/checkout`]") != 1 {
		t.Errorf("actions/checkout should appear once\n%s", got)
	}
	if strings.Count(got, "[`actions/setup-go`]") != 1 {
		t.Errorf("actions/setup-go should appear once\n%s", got)
	}
	if strings.Contains(got, "**0 commits**") {
		t.Errorf("should not contain commit counts\n%s", got)
	}
}
