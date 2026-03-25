package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/vvoland/gha-pin-diff/pkg/comment"
	"github.com/vvoland/gha-pin-diff/pkg/compare"
	"github.com/vvoland/gha-pin-diff/pkg/diffparser"
	"github.com/vvoland/gha-pin-diff/pkg/github"
	"github.com/vvoland/gha-pin-diff/pkg/render"
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

	log.Printf("found %d action pin update(s)", len(updates))

	// 4. Fetch comparisons.
	results := compare.Fetch(ctx, client, updates)

	// 5. Render comment.
	body := render.Comment(results)

	// 6. Create or update PR comment.
	return comment.Ensure(ctx, client, owner, repoName, pr, body)
}

func getPRNumber() (int, error) {
	// First try INPUT_PR_NUMBER (explicit input).
	if s := os.Getenv("INPUT_PR_NUMBER"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			return 0, fmt.Errorf("invalid INPUT_PR_NUMBER: %q", s)
		}
		return n, nil
	}

	// Fall back to GITHUB_EVENT_PATH.
	eventPath := os.Getenv("GITHUB_EVENT_PATH")
	if eventPath == "" {
		return 0, errors.New("GITHUB_EVENT_PATH or INPUT_PR_NUMBER is required")
	}

	data, err := os.ReadFile(eventPath)
	if err != nil {
		return 0, fmt.Errorf("reading event file: %w", err)
	}

	var event struct {
		PullRequest struct {
			Number int `json:"number"`
		} `json:"pull_request"`
		Number int `json:"number"`
	}
	if err := json.Unmarshal(data, &event); err != nil {
		return 0, fmt.Errorf("parsing event JSON: %w", err)
	}

	if event.PullRequest.Number != 0 {
		return event.PullRequest.Number, nil
	}
	if event.Number != 0 {
		return event.Number, nil
	}
	return 0, errors.New("could not determine PR number from event")
}

func isWorkflowFile(path string) bool {
	dir := filepath.Dir(path)
	return dir == ".github/workflows" || strings.HasPrefix(dir, ".github/workflows/")
}
