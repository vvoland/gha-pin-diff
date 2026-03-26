// Package pinverify verifies that SHA-pinned action refs match their tag comments.
package pinverify

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
	"github.com/vvoland/gha-pin-diff/pkg/github"
)

// Mismatch reports a tag comment that doesn't match the pinned SHA.
type Mismatch struct {
	Update    diffparser.ActionUpdate
	Tag       string // the tag from the comment (e.g. "v6.2.0")
	ExpectSHA string // SHA the tag actually resolves to
}

// Check verifies that new SHA pins match their inline tag comments.
// Only checks updates where NewRef is a SHA and NewTag is present.
func Check(ctx context.Context, client *github.Client, updates []diffparser.ActionUpdate) []Mismatch {
	type job struct {
		idx    int
		update diffparser.ActionUpdate
	}

	var jobs []job
	for i, u := range updates {
		if !isSHA(u.NewRef) || u.NewTag == "" {
			continue
		}
		if isSHA(u.NewTag) {
			continue
		}
		jobs = append(jobs, job{idx: i, update: u})
	}

	if len(jobs) == 0 {
		return nil
	}

	// Deduplicate by action+tag to avoid redundant API calls.
	type key struct{ action, tag string }
	resolved := make(map[key]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	seen := make(map[key]bool)
	for _, j := range jobs {
		k := key{j.update.Action, j.update.NewTag}
		if seen[k] {
			continue
		}
		seen[k] = true
		wg.Go(func() {
			owner, repo, ok := actionOwnerRepo(j.update.Action)
			if !ok {
				return
			}
			sha, err := client.ResolveRefSHA(ctx, owner, repo, j.update.NewTag)
			if err != nil {
				log.Printf("warning: could not resolve tag %s for %s: %v", j.update.NewTag, j.update.Action, err)
				return
			}
			mu.Lock()
			resolved[k] = sha
			mu.Unlock()
		})
	}
	wg.Wait()

	var mismatches []Mismatch
	for _, j := range jobs {
		k := key{j.update.Action, j.update.NewTag}
		sha, ok := resolved[k]
		if !ok {
			continue
		}
		if sha != j.update.NewRef {
			mismatches = append(mismatches, Mismatch{
				Update:    j.update,
				Tag:       j.update.NewTag,
				ExpectSHA: sha,
			})
		}
	}
	return mismatches
}

func isSHA(s string) bool {
	if len(s) != 40 {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

func actionOwnerRepo(action string) (string, string, bool) {
	owner, rest, ok := strings.Cut(action, "/")
	if !ok {
		return "", "", false
	}
	repo, _, _ := strings.Cut(rest, "/")
	return owner, repo, true
}

// FormatMismatch returns a human-readable description of a mismatch.
func FormatMismatch(m Mismatch) string {
	return fmt.Sprintf("%s: tag %s resolves to %s, but pinned to %s",
		m.Update.Action, m.Tag, m.ExpectSHA[:7], m.Update.NewRef[:7])
}
