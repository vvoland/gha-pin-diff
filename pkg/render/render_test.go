package render

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/pawel/gha-pin-diff/pkg/compare"
	"github.com/pawel/gha-pin-diff/pkg/diffparser"
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
	if !strings.Contains(got, "| `abc1234` | Fix something | @alice | 2024-04-15 |") {
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

	// Count table rows (lines starting with "| `")
	rows := 0
	for _, line := range strings.Split(got, "\n") {
		if strings.HasPrefix(line, "| `") {
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
		t.Error("results should be sorted by file then action")
	}
}
