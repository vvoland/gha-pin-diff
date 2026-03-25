// Package render produces the Markdown PR comment body from comparison results.
package render

import (
	"fmt"
	"sort"
	"strings"

	"github.com/pawel/gha-pin-diff/pkg/compare"
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

	// Sort by file, then action for stable output.
	sort.Slice(results, func(i, j int) bool {
		if results[i].Update.File != results[j].Update.File {
			return results[i].Update.File < results[j].Update.File
		}
		return results[i].Update.Action < results[j].Update.Action
	})

	var b strings.Builder
	b.WriteString(Marker)
	b.WriteString("\n## 🔄 Action Pin Diff\n")

	for _, r := range results {
		b.WriteByte('\n')
		renderResult(&b, r)
	}

	return b.String()
}

func renderResult(b *strings.Builder, r compare.Result) {
	u := r.Update
	actionRepo := actionRepoURL(u.Action)

	// Header: action name with version range
	fmt.Fprintf(b, "### [`%s`](%s)", u.Action, actionRepo)
	if u.OldTag != "" || u.NewTag != "" {
		old := u.OldTag
		if old == "" {
			old = u.OldRef[:7]
		}
		new := u.NewTag
		if new == "" {
			new = u.NewRef[:7]
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
		sha := c.SHA
		if len(sha) > 7 {
			sha = sha[:7]
		}
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
	parts := strings.SplitN(action, "/", 3)
	if len(parts) < 2 {
		return action
	}
	return parts[0] + "/" + parts[1]
}

func escapeMarkdown(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}
