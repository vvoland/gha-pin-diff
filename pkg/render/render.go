// Package render produces the Markdown PR comment body from comparison results.
package render

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/vvoland/gha-pin-diff/pkg/compare"
	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
)

// Marker is the HTML comment used to identify bot comments.
const Marker = "<!-- gha-pin-diff -->"

// MaxCommitsShown is the maximum number of commits displayed per action.
const MaxCommitsShown = 15

// Comment renders the full Markdown comment body for the given comparison results.
// Returns empty string if there are no results.
func Comment(results []compare.Result) string {
	if len(results) == 0 {
		return ""
	}

	// Sort by action, then refs for grouping, then file for stable output.
	slices.SortFunc(results, func(a, b compare.Result) int {
		if c := cmp.Compare(a.Update.Action, b.Update.Action); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Update.OldRef, b.Update.OldRef); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Update.NewRef, b.Update.NewRef); c != 0 {
			return c
		}
		return cmp.Compare(a.Update.File, b.Update.File)
	})

	var b strings.Builder
	b.WriteString(Marker)
	b.WriteString("\n## 🔄 Action Pin Diff\n")

	for i, r := range results {
		if i > 0 && sameComparison(results[i-1].Update, r.Update) {
			continue
		}
		b.WriteByte('\n')
		renderResult(&b, r)
	}

	return b.String()
}

func sameComparison(a, b diffparser.ActionUpdate) bool {
	return a.Action == b.Action && a.OldRef == b.OldRef && a.NewRef == b.NewRef
}

func renderResult(b *strings.Builder, r compare.Result) {
	u := r.Update
	actionRepo := actionRepoURL(u.Action)

	// Header: action name with version range
	fmt.Fprintf(b, "### [`%s`](%s)", u.Action, actionRepo)
	if u.OldTag != "" || u.NewTag != "" {
		old := u.OldTag
		if old == "" {
			old = shortRef(u.OldRef)
		}
		new := u.NewTag
		if new == "" {
			new = shortRef(u.NewRef)
		}
		fmt.Fprintf(b, " `%s` → `%s`", old, new)
	}
	b.WriteByte('\n')

	if r.Err != nil {
		fmt.Fprintf(b, "\n⚠️ Could not fetch comparison: %v\n", r.Err)
		fmt.Fprintf(b, "\n[View diff manually](https://github.com/%s/compare/%s...%s)\n",
			actionOwnerRepo(u.Action), u.OldRef, u.NewRef)
		return
	}

	// Summary line
	commitWord := "commits"
	if r.TotalCommits == 1 {
		commitWord = "commit"
	}
	fmt.Fprintf(b, "\n**%d %s**", r.TotalCommits, commitWord)
	if r.CompareURL != "" {
		fmt.Fprintf(b, " · [Compare](%s)", r.CompareURL)
	}
	b.WriteByte('\n')

	if len(r.Commits) == 0 {
		return
	}

	// Commit table
	b.WriteString("\n| SHA | Message | Author | Date |\n")
	b.WriteString("|-----|---------|--------|------|\n")

	shown := r.Commits
	if len(shown) > MaxCommitsShown {
		shown = shown[len(shown)-MaxCommitsShown:]
	}

	for _, c := range shown {
		sha := shortRef(c.SHA)
		date := ""
		if !c.Date.IsZero() {
			date = c.Date.Format("2006-01-02")
		}
		msg := escapeMarkdown(c.Message)
		if len(msg) > 80 {
			msg = msg[:77] + "..."
		}
		author := c.Author
		if author != "" {
			author = "@" + author
		}
		fmt.Fprintf(b, "| `%s` | %s | %s | %s |\n", sha, msg, author, date)
	}

	if r.TotalCommits > MaxCommitsShown {
		fmt.Fprintf(b, "\n*Showing %d of %d commits. [View all](%s)*\n",
			MaxCommitsShown, r.TotalCommits, r.CompareURL)
	}
}

func actionRepoURL(action string) string {
	return "https://github.com/" + actionOwnerRepo(action)
}

func actionOwnerRepo(action string) string {
	owner, rest, ok := strings.Cut(action, "/")
	if !ok {
		return action
	}
	repo, _, _ := strings.Cut(rest, "/")
	return owner + "/" + repo
}

func escapeMarkdown(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

func shortRef(ref string) string {
	if len(ref) > 7 {
		return ref[:7]
	}
	return ref
}
