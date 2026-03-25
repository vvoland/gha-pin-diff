// Package compare fetches commit comparisons for action pin updates.
package compare

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/pawel/gha-pin-diff/pkg/diffparser"
	"github.com/pawel/gha-pin-diff/pkg/github"
)

// Result holds the comparison data for a single action update.
type Result struct {
	Update       diffparser.ActionUpdate
	CompareURL   string
	TotalCommits int
	Commits      []CommitInfo
	Err          error
}

// CommitInfo is a simplified commit summary.
type CommitInfo struct {
	SHA     string
	Message string // first line only
	Author  string
	Date    time.Time
}

// Fetch fetches comparison data for each action update.
func Fetch(ctx context.Context, client *github.Client, updates []diffparser.ActionUpdate) []Result {
	results := make([]Result, len(updates))
	for i, u := range updates {
		results[i] = fetchOne(ctx, client, u)
	}
	return results
}

func fetchOne(ctx context.Context, client *github.Client, u diffparser.ActionUpdate) Result {
	owner, repo := actionOwnerRepo(u.Action)
	if owner == "" {
		return Result{
			Update: u,
			Err:    fmt.Errorf("cannot parse owner/repo from %q", u.Action),
		}
	}

	cmp, err := client.CompareCommits(ctx, owner, repo, u.OldRef, u.NewRef)
	if err != nil {
		log.Printf("warning: compare failed for %s (%s...%s): %v", u.Action, u.OldRef[:7], u.NewRef[:7], err)
		return Result{
			Update: u,
			Err:    err,
		}
	}

	commits := make([]CommitInfo, 0, len(cmp.Commits))
	for _, c := range cmp.Commits {
		author := c.Commit.Author.Name
		if c.Author != nil && c.Author.Login != "" {
			author = c.Author.Login
		}

		var date time.Time
		if c.Commit.Author.Date != "" {
			date, _ = time.Parse(time.RFC3339, c.Commit.Author.Date)
		}

		commits = append(commits, CommitInfo{
			SHA:     c.SHA,
			Message: firstLine(c.Commit.Message),
			Author:  author,
			Date:    date,
		})
	}

	return Result{
		Update:       u,
		CompareURL:   cmp.HTMLURL,
		TotalCommits: cmp.TotalCommits,
		Commits:      commits,
	}
}

// actionOwnerRepo extracts owner and repo from an action target.
// "actions/checkout" -> ("actions", "checkout")
// "org/repo/.github/workflows/x.yml" -> ("org", "repo")
func actionOwnerRepo(action string) (string, string) {
	parts := strings.SplitN(action, "/", 3)
	if len(parts) < 2 {
		return "", ""
	}
	return parts[0], parts[1]
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
