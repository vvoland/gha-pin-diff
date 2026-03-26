// Package render produces the Markdown PR comment body from comparison results.
package render

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/vvoland/gha-pin-diff/pkg/compare"
	"github.com/vvoland/gha-pin-diff/pkg/pinverify"
)

// Marker is the HTML comment used to identify bot comments.
const Marker = "<!-- gha-pin-diff -->"

// MaxCommitsShown is the maximum number of commits displayed per action.
const MaxCommitsShown = 15

// Comment renders the full Markdown comment body for the given comparison results.
// Returns empty string if there are no results and no mismatches.
func Comment(results []compare.Result, mismatches []pinverify.Mismatch) string {
	if len(results) == 0 && len(mismatches) == 0 {
		return ""
	}

	// Deduplicate and partition into pin-only vs changed.
	results = dedup(results)
	var pinOnly, changed []compare.Result
	for _, r := range results {
		if isPinOnly(r) {
			pinOnly = append(pinOnly, r)
		} else {
			changed = append(changed, r)
		}
	}

	var b strings.Builder
	b.WriteString(Marker)
	b.WriteString("\n## 🔄 Action Pin Diff\n")

	if len(mismatches) > 0 {
		renderMismatches(&b, mismatches)
	}

	for _, r := range changed {
		b.WriteByte('\n')
		renderResult(&b, r)
	}

	if len(pinOnly) > 0 {
		renderPinOnly(&b, pinOnly)
	}

	return b.String()
}

func dedup(results []compare.Result) []compare.Result {
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

	return slices.CompactFunc(results, func(a, b compare.Result) bool {
		return a.Update.Action == b.Update.Action &&
			a.Update.OldRef == b.Update.OldRef &&
			a.Update.NewRef == b.Update.NewRef
	})
}

// isPinOnly reports whether a result is a digest pin with no version change.
func isPinOnly(r compare.Result) bool {
	return r.Err == nil && r.TotalCommits == 0
}

func renderPinOnly(b *strings.Builder, results []compare.Result) {
	b.WriteString("\n### 📌 Pinned (digest unchanged)\n")
	b.WriteString("\n| Action | Version | Digest |\n")
	b.WriteString("|--------|---------|--------|\n")
	for _, r := range results {
		u := r.Update
		tag := u.NewTag
		if tag == "" {
			tag = u.OldTag
		}
		if tag == "" {
			tag = shortRef(u.NewRef)
		}
		commitURL := fmt.Sprintf("https://github.com/%s/commit/%s", actionOwnerRepo(u.Action), u.NewRef)
		fmt.Fprintf(b, "| [`%s`](%s) | `%s` | [`%s`](%s) |\n", u.Action, actionRepoURL(u.Action), tag, shortRef(u.NewRef), commitURL)
	}
}

func renderMismatches(b *strings.Builder, mismatches []pinverify.Mismatch) {
	b.WriteString("\n### ⚠️ Tag / SHA Mismatch\n")
	b.WriteString("\nThe following pins reference a SHA that does not match the tag in the comment:\n")
	b.WriteString("\n| Action | Tag | Expected SHA | Pinned SHA |\n")
	b.WriteString("|--------|-----|-------------|------------|\n")
	for _, m := range mismatches {
		u := m.Update
		tagURL := fmt.Sprintf("https://github.com/%s/releases/tag/%s", actionOwnerRepo(u.Action), m.Tag)
		expectURL := fmt.Sprintf("https://github.com/%s/commit/%s", actionOwnerRepo(u.Action), m.ExpectSHA)
		pinnedURL := fmt.Sprintf("https://github.com/%s/commit/%s", actionOwnerRepo(u.Action), u.NewRef)
		fmt.Fprintf(b, "| [`%s`](%s) | [`%s`](%s) | [`%s`](%s) | [`%s`](%s) |\n",
			u.Action, actionRepoURL(u.Action),
			m.Tag, tagURL,
			shortRef(m.ExpectSHA), expectURL,
			shortRef(u.NewRef), pinnedURL)
	}
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
	ownerRepo := actionOwnerRepo(u.Action)
	b.WriteString("\n| SHA | Message | Date |\n")
	b.WriteString("|-----|---------|------|\n")

	shown := r.Commits
	if len(shown) > MaxCommitsShown {
		shown = shown[len(shown)-MaxCommitsShown:]
	}

	for _, c := range shown {
		sha := shortRef(c.SHA)
		commitURL := fmt.Sprintf("https://github.com/%s/commit/%s", ownerRepo, c.SHA)
		date := ""
		if !c.Date.IsZero() {
			date = c.Date.Format("2006-01-02")
		}
		msg := escapeMarkdown(c.Message)
		if len(msg) > 80 {
			msg = msg[:77] + "..."
		}
		fmt.Fprintf(b, "| [`%s`](%s) | %s | %s |\n", sha, commitURL, msg, date)
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
