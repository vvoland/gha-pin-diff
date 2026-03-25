package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/vvoland/gha-pin-diff/pkg/comment"
	"github.com/vvoland/gha-pin-diff/pkg/compare"
	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
	"github.com/vvoland/gha-pin-diff/pkg/github"
	"github.com/vvoland/gha-pin-diff/pkg/render"
	"strconv"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return errors.New("GITHUB_TOKEN is required")
	}

	repo := os.Getenv("GITHUB_REPOSITORY") // "owner/repo"
	if repo == "" {
		return errors.New("GITHUB_REPOSITORY is required")
	}

	owner, repoName, ok := strings.Cut(repo, "/")
	if !ok {
		return fmt.Errorf("invalid GITHUB_REPOSITORY: %q", repo)
	}

	pr, err := getPRNumber()
	if err != nil {
		return err
	}

	ctx := context.Background()
	client := github.NewClient(token)

	// 1. Fetch changed files in the PR.
	files, err := client.ListPRFiles(ctx, owner, repoName, pr)
	if err != nil {
		return fmt.Errorf("fetching PR files: %w", err)
	}

	// 2. Filter to workflow files and collect patches.
	patches := make(map[string]string)
	for _, f := range files {
		if isWorkflowFile(f.Filename) && f.Patch != "" {
			patches[f.Filename] = f.Patch
		}
	}

	if len(patches) == 0 {
		log.Println("no workflow file changes found")
		return comment.Ensure(ctx, client, owner, repoName, pr, "")
	}

	// 3. Parse action pin changes from patches.
	updates := diffparser.Parse(patches)
	if len(updates) == 0 {
		log.Println("no SHA-pinned action changes detected")
		return comment.Ensure(ctx, client, owner, repoName, pr, "")
	}

	// Deduplicate updates that refer to the same comparison.
	updates = dedup(updates)

	log.Printf("found %d unique action pin update(s)", len(updates))

	// 4. Fetch comparisons.
	results := compare.Fetch(ctx, client, updates)

	// 5. Render comment.
	body := render.Comment(results)

	// 6. Create or update PR comment.
	return comment.Ensure(ctx, client, owner, repoName, pr, body)
}

func getPRNumber() (int, error) {
	s := os.Getenv("PR_NUMBER")
	if s == "" {
		return 0, errors.New("PR_NUMBER is not set (is the trigger a pull_request event?)")
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("invalid PR_NUMBER %q: %w", s, err)
	}
	return n, nil
}

func isWorkflowFile(path string) bool {
	dir := filepath.Dir(path)
	return dir == ".github/workflows" || strings.HasPrefix(dir, ".github/workflows/")
}

type comparisonKey struct {
	action, oldRef, newRef string
}

func dedup(updates []diffparser.ActionUpdate) []diffparser.ActionUpdate {
	seen := make(map[comparisonKey]bool, len(updates))
	out := make([]diffparser.ActionUpdate, 0, len(updates))
	for _, u := range updates {
		k := comparisonKey{u.Action, u.OldRef, u.NewRef}
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, u)
	}
	return out
}
