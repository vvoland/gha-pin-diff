// Package compare fetches commit comparisons for action pin updates.
package compare

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
	"github.com/vvoland/gha-pin-diff/pkg/github"
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

// Fetch fetches comparison data for each action update concurrently.
func Fetch(ctx context.Context, client *github.Client, updates []diffparser.ActionUpdate) []Result {
	results := make([]Result, len(updates))
	var wg sync.WaitGroup
	for i, u := range updates {
		wg.Go(func() {
			results[i] = fetchOne(ctx, client, u)
		})
	}
	wg.Wait()
	return results
}

func fetchOne(ctx context.Context, client *github.Client, u diffparser.ActionUpdate) Result {
	owner, repo, ok := actionOwnerRepo(u.Action)
	if !ok {
		return Result{
			Update: u,
			Err:    fmt.Errorf("cannot parse owner/repo from %q", u.Action),
		}
	}

	cmp, err := client.CompareCommits(ctx, owner, repo, u.OldRef, u.NewRef)
	if err != nil {
		// Use errors.AsType (Go 1.26) for typed error inspection.
		if apiErr, ok := errors.AsType[*github.APIError](err); ok {
			log.Printf("warning: compare failed for %s (%s...%s): HTTP %d",
				u.Action, shortRef(u.OldRef), shortRef(u.NewRef), apiErr.StatusCode)
		} else {
			log.Printf("warning: compare failed for %s (%s...%s): %v",
				u.Action, shortRef(u.OldRef), shortRef(u.NewRef), err)
		}
		return Result{Update: u, Err: err}
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
// "actions/checkout" -> ("actions", "checkout", true)
// "org/repo/.github/workflows/x.yml" -> ("org", "repo", true)
func actionOwnerRepo(action string) (string, string, bool) {
	owner, rest, ok := strings.Cut(action, "/")
	if !ok {
		return "", "", false
	}
	repo, _, _ := strings.Cut(rest, "/")
	return owner, repo, true
}

func firstLine(s string) string {
	if line, _, ok := strings.Cut(s, "\n"); ok {
		return line
	}
	return s
}

func shortRef(ref string) string {
	if len(ref) > 7 {
		return ref[:7]
	}
	return ref
}
